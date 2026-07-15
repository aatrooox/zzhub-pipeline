declare module "*.css?raw" {
  const css: string;
  export default css;
}

declare module "juice/client" {
  import juice from "juice";
  export default juice;
}
