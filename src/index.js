/* Overview of how we find the homologues of a gene:
 * 1. We only have the internal (to this mine) ID of our gene, so we run a
 *    query to get the symbol and organism for our gene.
 * 2. Using the API URL of our mine passed from BlueGenes, we get its namespace
 *    and use this to identify the mine in a query for mine instances to find
 *    its neighbours.
 * 3. For each neighbour, (or rather neighbourhood) we will query each of the
 *    belonging mine instances for homologues, gradually building up the list
 *    of results.
 */

// Constants you can change to customise the behaviour of this tool.
var SHOW_GENES_COUNT = 5;
var QUERY_TIMEOUT = 30*1000;

// State we keep track of so we don't need to query the DOM.
var nsToElem = {};
var emptyMines = [];
var noteElem;

// Use the gene ID we get from BlueGenes to get the gene's symbol and organism.
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

// Use our mine's API URL to get its neighbours.
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

// Convert a gene object to its symbol string, with multiple fallbacks as some
// properties may be undefined.
function geneToSymbol(obj) {
  return obj.symbol || obj.primaryIdentifier || obj.secondaryIdentifier;
}

// Create a portal URL to a different mine for use with our anchor elements.
// `gene` can be either a single gene symbol, or an array of multiple.
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

// Render the name of the mine `instance`, along with a simple loading indicator
// if `isLoading` is true. The elements will be mounted onto `node`.
function renderMine(node, instance, isLoading) {
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

  if (isLoading) {
    var loading = document.createElement("i");
    loading.appendChild(document.createTextNode("Loading..."));
    div.appendChild(loading);
  }

  nsToElem[instance.namespace] = mine;

  node.appendChild(div);
}

// Helper to create an anchor element by passing an `attrs` object.
function anchorElement(attrs) {
  var anchor = document.createElement("a");
  anchor.href = attrs.href;
  anchor.target = "_blank";
  anchor.appendChild(document.createTextNode(attrs.text));

  if (attrs.className) anchor.className = attrs.className;

  return anchor;
}

// Render the list of `homologues` belonging to a mine `instance`. They will be
// mounted as siblings to the mine name, which is added to the DOM by
// `renderMine`. A function which takes a mine instance object and returns a
// predicate function for filtering the list of homologues can be passed as
// `homologueFilter`.
function renderHomologues(instance, homologueFilter, homologues) {
  var div = nsToElem[instance.namespace].parentNode;
  var node = div.parentNode;

  var homologueList = homologues.filter(homologueFilter(instance));

  if (homologueList.length) {
    // Update the mine name element to remove the loading indicator.
    node.removeChild(div);
    renderMine(node, instance, false);
    // The reference of `div` will have been removed, so we need to update it.
    div = nsToElem[instance.namespace].parentNode;

    // Truncate list of homologues and render these.
    homologueList.slice(0, SHOW_GENES_COUNT).forEach(function(homologue) {
      var symbol = geneToSymbol(homologue);

      div.appendChild(
        anchorElement({
          href: createPortalUrl(instance.url, symbol),
          text: symbol.concat(" (", homologue.organism.shortName, ")")
        });
      );
    })

    // Append a "Show all" link if the list has been truncated.
    if (homologueList.length > SHOW_GENES_COUNT) {
      var symbols = homologueList.map(geneToSymbol);

      div.appendChild(
        anchorElement({
          className: "homology-show-all",
          href: createPortalUrl(instance.url, symbols),
          text: "Show all ".concat("(", homologueList.length, "+)")
        });
      );
    }
  } else {
    // This InterMine instance has either errored out, or it has no homologues;
    // in both cases we'll move it to the list of mines without homologues.
    node.removeChild(div);

    emptyMines.push(instance.name);

    if (noteElem) node.parentNode.removeChild(noteElem);

    noteElem = document.createElement("i");
    var noteText = "No homologues available for: "
      .concat(emptyMines.join(", "));
    noteElem.appendChild(document.createTextNode(noteText));
    node.parentNode.appendChild(noteElem);
  }
}

// Query a mine `instance` for the homologues of a gene `symbol`.
function getHomologues(symbol, instance) {
  var intermine = new imjs.Service({root: instance.url});

  var path = "homologues.homologue";

  if (instance.namespace === "phytomine") {
    // PhytoMine uses the American spelling for homolog.
    // (They also use a different path.)
    path = "homolog.gene";
  }

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
        "path": path,
        "op": "LOOKUP",
        "value": symbol,
        "extraValue": "",
        "code": "A"
      }
    ]
  };

  // Use `Promise.race` so we can do the query with a timeout.
  return Promise.race([
    intermine.records(query),
    new Promise(function(_resolve, reject) {
      setTimeout(reject, QUERY_TIMEOUT);
    })
  ])
}

// The main function invoked by BlueGenes.
export function main (el, service, imEntity, _state, _config) {
  querySymbol(service.root, imEntity.value).then(function(querySymbolRes) {
    var targetSymbol = querySymbolRes[0];
    var targetOrganism = querySymbolRes[1];

    queryNeighbours(service.root).then(function(neighbours) {
      neighbours.forEach(function(targetNeighbour) {
        // Get all mine instances that have the same neighbour.
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

            // Query for homologues and render the data!
            instances.forEach(function(instance) {
              renderMine(el, instance, true);
              getHomologues(targetSymbol, instance)
                .then(function(res) {
                  renderHomologues(instance, homologueFilter, res);
                })
                .catch(function(_err) {
                  renderHomologues(instance, homologueFilter, []);
                });
            });
          });
      });
    });
  });
}
