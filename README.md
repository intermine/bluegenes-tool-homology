Start of a replacement for the now removed BlueGenes Homologues section. 

Rough spec: 

1. given the URL of an intermine, fetch its neighbours (if any) from registry.intermine.org
2. check all neighbours for homologues of a given gene. FIRST ask the remote mine, then only ask THIS mine if the remote doesn't know. 
3. link to the InterMine, using the portal link (?) or possibly the FAIR link (?)

#  Homology Links

FIXME: fill out a description of your tool here! :)

## Licence


### To set up locally for development

1. Clone the repo
2. `cd bluegenes-tool-homology` and then `npm install` to install dependencies.

All of the editable source files for css and js are in `src`. To bundle for prod, run the following commands:

#### CSS

Assuming [less](http://lesscss.org/) is installed globally:

```
npm run less
```

#### JS

Assuming [webpack](https://webpack.js.org/) is installed globally:

##### Single build:
```
npm run build
```

##### Developing:
Run each of these commands in separate terminals:

To rebuild your js every time you save:

```bash
npm run dev
```

To serve your page at [http://localhost:3456](http://localhost:3456):
```bash
npm run server
```
