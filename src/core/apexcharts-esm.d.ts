// What the package's ESM build exports, for the compiler: it ships no declaration file for this path.
// Pattern: an ambient module declaration (TypeScript Handbook, Modules .d.ts), as narrow as the one import of src/core/apex-lib.ts needs;
// apex.ts types what the panel calls of the constructor.
// Must not: grow into the library's whole API, or be imported by anything but apex-lib.ts.
declare module 'apexcharts/dist/apexcharts.esm.js' {
  const ApexCharts: new (element: Element, options: object) => unknown;
  export default ApexCharts;
}
