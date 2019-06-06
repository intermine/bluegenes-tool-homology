function neighbourUrls(data) {
  var obj = {};

  data.instances.forEach(function(instance) {
    instance.neighbours.forEach(function(neighbour) {
      if (obj[neighbour]) {
        obj[neighbour].push(instance.url);
      } else {
        obj[neighbour] = [instance.url];
      }
    });
  });

  return obj;
}

function queryHomologues(symbol, url) {
  return new Promise(function(resolve) {
    var intermine = new imjs.Service({root: url});

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
      resolve([url, res]);
    });
  });
}

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

function geneToSymbol(obj) {
  return obj.symbol || obj.primaryIdentifier || obj.secondaryIdentifier;
}

function extractHomologueLists(queryResults) {
  var obj = {}

  queryResults.forEach(function(result) {
    var url = result[0];
    var homologueList = result[1];
    obj[url] = homologueList.map(geneToSymbol);
  })

  return obj;
}

function createPortalUrl(gene, apiUrl) {
  return apiUrl.concat(
    "/portal.do",
    "?class=Gene",
    "&externalid=".concat(gene)
  );
}

function renderHomologueLinks(homologueObj, node) {
  Object.keys(homologueObj).forEach(function(url) {
    var genes = homologueObj[url];

    genes.forEach(function(gene) {
      var anchor = document.createElement("a");
      anchor.href = createPortalUrl(gene, url);
      var text = document.createTextNode(gene);
      anchor.appendChild(text);
      node.appendChild(anchor);
    })
  })
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

export function main (el, service, imEntity, state, config) {
  querySymbol(service.root, imEntity.value).then(function(symbol) {
    queryNeighbours(service.root).then(function(neighbours) {
      neighbours.forEach(function(family) {
        fetch("https://registry.intermine.org/service/instances")
          .then(function(res) { return res.json(); })
          .then(function(instancesData) {
            var familyToUrls = neighbourUrls(instancesData);
            var urls = familyToUrls[family];

            var homologuePromises = urls.map(function(url) {
              return queryHomologues(symbol, url);
            });

            Promise.all(homologuePromises).then(function(results) {
              var homologueObj = extractHomologueLists(results);
              renderHomologueLinks(homologueObj, el);
            });
          });
      });
    });
  });
}
