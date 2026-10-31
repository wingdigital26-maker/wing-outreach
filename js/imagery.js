// ---- Aerial imagery source: ONE constant. Default is USDA NAIP via the USGS National Map (US government, public domain).
// To drop in a paid Esri ArcGIS Location Platform key later, change only this block:
//   kind: "xyz", url: "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=YOUR_KEY",
//   attribution: "Esri, Maxar, Earthstar Geographics", maxzoom: 19
// ("export" kind = ArcGIS ImageServer exportImage with a {bbox-epsg-3857} placeholder, as NAIP uses.)
window.RC_IMAGERY = {
  kind: "export",
  url: "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&f=image",
  attribution: "Imagery: USDA NAIP via USGS The National Map",
  label: "USDA NAIP imagery",
  maxzoom: 19,
  // MapLibre raster source for this imagery
  source: function () { return { type: "raster", tiles: [this.url], tileSize: 256, maxzoom: this.maxzoom, attribution: this.attribution }; },
  // single tile URL for slippy tile z/x/y (used by the proposal thumbnail)
  tileUrl: function (z, x, y) {
    if (this.kind !== "export") return this.url.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    const W = 20037508.342789244, s = 2 * W / Math.pow(2, z);
    const x0 = -W + x * s, y1 = W - y * s, bb = [x0, y1 - s, x0 + s, y1].join(",");
    return this.url.replace("{bbox-epsg-3857}", bb);
  }
};
