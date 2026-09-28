/** Metro resolves bundled images to an opaque asset id usable as an `<Image source>`. */
declare module '*.png' {
  const asset: number;
  export default asset;
}
