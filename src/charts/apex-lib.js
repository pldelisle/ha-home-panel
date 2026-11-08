// The one module that names the library and its stylesheet, so that Vite puts both in a single lazy chunk (a stylesheet
// imported by apex.js itself would sit in the entry, which imports apex.js statically). Only apex.js imports this file,
// and only with import(). The ESM build is the package's own; its main file is CommonJS, which Vite wraps in a helper.
import css from 'apexcharts/dist/apexcharts.css?raw';
import ApexCharts from 'apexcharts/dist/apexcharts.esm.js';

export {ApexCharts, css};
