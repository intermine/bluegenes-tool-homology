var SHOW_GENES_COUNT = 5;

function querySymbol(url, id) {
  return new Promise(function(resolve) {
    var intermine = new imjs.Service({root: url});

    var query = {
      "from": "Gene",
      "select": [
        "symbol",
        "primaryIdentifier",
        "secondaryIdentifier",
        "organism.name"
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
      const organism = res[0].organism.name;
      resolve([symbol, organism]);
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

function geneToSymbol(obj) {
  return obj.symbol || obj.primaryIdentifier || obj.secondaryIdentifier;
}

function createPortalUrl(apiUrl, gene) {
  var exid = Array.isArray(gene)
    ? "&externalids=".concat(gene.join(","))
    : "&externalid=".concat(gene);

  return apiUrl.concat(
    "/portal.do",
    "?class=Gene",
    exid
  );
}

var nsToElem = {};

function renderMine(node, instance) {
  var div = document.createElement("div");
  div.className = "homology-mine-view";

  var mine = document.createElement("span");
  var text = document.createTextNode(instance.name);
  mine.appendChild(text);
  mine.style.color = instance.colors
    && instance.colors.header
    && instance.colors.header.main
    || "#000";
  div.appendChild(mine);

  nsToElem[instance.namespace] = mine;

  node.appendChild(div);
}

function renderHomologues(instance, homologueFilter, homologues) {
  var div = nsToElem[instance.namespace].parentNode;

  var homologueList = homologues.filter(homologueFilter(instance));

  if (homologueList.length) {
    homologueList.slice(0, SHOW_GENES_COUNT).forEach(function(homologue) {
      var symbol = geneToSymbol(homologue);

      var anchor = document.createElement("a");
      anchor.href = createPortalUrl(instance.url, symbol);
      anchor.target = "_blank";
      var entry = symbol.concat(" (", homologue.organism.shortName, ")");
      anchor.appendChild(document.createTextNode(entry));

      div.appendChild(anchor);
    })

    if (homologueList.length > SHOW_GENES_COUNT) {
      var showAll = document.createElement("a");
      var symbols = homologueList.map(geneToSymbol);
      showAll.className = "homology-show-all";
      showAll.href = createPortalUrl(instance.url, symbols);
      showAll.target = "_blank";
      var showAllText = "Show all ".concat("(", homologueList.length, "+)");
      showAll.appendChild(document.createTextNode(showAllText));

      div.appendChild(showAll);
    }
  } else {
    // This InterMine instance has no homologues, so we remove it!
    div.parentNode.removeChild(div);
  }
}

function getHomologues(node, homologueFilter, symbol, instance) {
  var intermine = new imjs.Service({root: instance.url});

  var query = {
    "from": "Gene",
    "select": [
      "secondaryIdentifier",
      "symbol",
      "primaryIdentifier",
      "organism.name",
      "organism.shortName"
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

  renderMine(node, instance);

  intermine.records(query).then(function(res) {
    renderHomologues(instance, homologueFilter, res);
  });
}

export function main (el, service, imEntity, state, config) {
  querySymbol(service.root, imEntity.value).then(function(querySymbolRes) {
    var targetSymbol = querySymbolRes[0];
    var targetOrganism = querySymbolRes[1];

    queryNeighbours(service.root).then(function(neighbours) {
      neighbours.forEach(function(targetNeighbour) {
        fetch("https://registry.intermine.org/service/instances")
          .then(function(res) { return res.json(); })
          .then(function(data) {
            var instances = data.instances.filter(function(instance) {
              return instance.neighbours.includes(targetNeighbour);
            });

            // This function will be used to filter our list of homologues
            // later on, based on data that we have in scope here.
            var homologueFilter = function(instance) {
              // Partially applied so we can compare the InterMine instance.
              return function(homologue) {
                // Keep if either in local mine, or from different organism.
                return instance.url === service.root
                  || homologue.organism.name !== targetOrganism;
              }
            }

            instances.forEach(function(instance) {
              getHomologues(el, homologueFilter, targetSymbol, instance);
            });
          });
      });
    });
  });
}
