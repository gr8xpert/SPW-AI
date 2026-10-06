// Vite: `import css from './x.css?inline'` gives the stylesheet as a string.
declare module '*.css?inline' {
  const css: string;
  export default css;
}
