import fs from "fs";
import path from "path";

const GEO_DIR = path.join(__dirname, "..", "geo");

let provinciasCache: GeoJSON.FeatureCollection | null = null;
let municipiosCache: GeoJSON.FeatureCollection | null = null;

export function loadProvinciasGeo(): GeoJSON.FeatureCollection {
  if (!provinciasCache) {
    provinciasCache = JSON.parse(fs.readFileSync(path.join(GEO_DIR, "provincias.geojson"), "utf-8"));
  }
  return provinciasCache!;
}

export function loadMunicipiosGeo(): GeoJSON.FeatureCollection {
  if (!municipiosCache) {
    municipiosCache = JSON.parse(fs.readFileSync(path.join(GEO_DIR, "municipios.geojson"), "utf-8"));
  }
  return municipiosCache!;
}
