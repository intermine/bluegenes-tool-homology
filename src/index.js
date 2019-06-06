function querySymbol(url, id) {
  return new Promise(function(resolve) {
    var intermine = new imjs.Service({root: url});

    var query = {
      "from": "Gene",
      "select": [
        "symbol",
        "primaryIdentifier",
        "secondaryIdentifier",
      ],
      "orderBy": [
        {
          "path": "symbol",
          "direction": "ASC"
        }
      ],
      "where": [
        {
          "path": "id",
          "op": "=",
          "value": id,
          "code": "A"
        }
      ]
    };

    intermine.records(query).then(function(res) {
      const symbol = geneToSymbol(res[0]);
      resolve(symbol);
    });
  });
}

function queryNeighbours(mineUrl) {
  return new Promise(function(resolve) {
    fetch(
      "http://registry.intermine.org/service/namespace?url="
        .concat(encodeURIComponent(mineUrl))
    )
      .then(function(res) { return res.json(); })
      .then(function(nsData) {
        fetch("https://registry.intermine.org/service/instances")
          .then(function(res) { return res.json(); })
          .then(function(instancesData) {
            resolve(
              instancesData
                .instances
                .find(e => e.namespace === nsData.namespace)
                .neighbours
            )
          });
      });
  });
}

function queryHomologues(symbol, instance) {
  return new Promise(function(resolve) {
    var intermine = new imjs.Service({root: instance.url});

    var query = {
      "from": "Gene",
      "select": [
        "secondaryIdentifier",
        "symbol",
        "primaryIdentifier",
        "organism.name",
        "homologues.homologue.secondaryIdentifier",
        "homologues.homologue.symbol",
        "homologues.homologue.primaryIdentifier",
        "homologues.homologue.organism.name"
      ],
      "orderBy": [
        {
          "path": "secondaryIdentifier",
          "direction": "ASC"
        }
      ],
      "where": [
        {
          "path": "homologues.homologue",
          "op": "LOOKUP",
          "value": symbol,
          "extraValue": "",
          "code": "A"
        }
      ]
    };

    intermine.records(query).then(function(res) {
      resolve([instance, res]);
    });
  });
}

function geneToSymbol(obj) {
  return obj.symbol || obj.primaryIdentifier || obj.secondaryIdentifier;
}

function createPortalUrl(apiUrl, gene) {
  return apiUrl.concat(
    "/portal.do",
    "?class=Gene",
    "&externalid=".concat(gene)
  );
}

function renderHomologueLinks(node, results) {
  results.forEach(function(result) {
    var instance = result[0];
    var homologueList = result[1];

    if (homologueList.length) {
      var div = document.createElement("div");

      var mine = document.createElement("span");
      mine.appendChild(document.createTextNode(instance.name));
      mine.style.color = instance.colors
        && instance.colors.header
        && instance.colors.header.main
        || '#000';
      div.appendChild(mine);

      homologueList.forEach(function(homologue) {
        var gene = geneToSymbol(homologue);

        var anchor = document.createElement("a");
        anchor.href = createPortalUrl(instance.url, gene);
        anchor.appendChild(document.createTextNode(gene));
        div.appendChild(anchor);
      })

      node.appendChild(div);
    }
  });
}

export function main (el, service, imEntity, state, config) {
  querySymbol(service.root, imEntity.value).then(function(targetSymbol) {
    queryNeighbours(service.root).then(function(neighbours) {
      neighbours.forEach(function(targetNeighbour) {
        fetch("https://registry.intermine.org/service/instances")
          .then(function(res) { return res.json(); })
          .then(function(data) {
            var instances = data.instances.filter(function(instance) {
              return instance.neighbours.includes(targetNeighbour);
            });

            var homologuePromises = instances.map(function(instance) {
              return queryHomologues(targetSymbol, instance);
            });

            Promise.all(homologuePromises).then(function(results) {
              renderHomologueLinks(el, results);
            });
          });
      });
    });
  });
}
