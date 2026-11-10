// The one module that names the library, so that Vite puts it in a lazy chunk of its own (a static import from apex.ts would
// sit in the entry). Only apex.ts imports this file, and only with import(). The ESM build is the package's own; its main
// file is CommonJS, which Vite wraps in a helper. Its stylesheet is not imported here: ApexCharts writes it into the shadow
// root itself, in a <style> of its own, each time a chart mounts.
import ApexCharts from 'apexcharts/dist/apexcharts.esm.js';

export {ApexCharts};
