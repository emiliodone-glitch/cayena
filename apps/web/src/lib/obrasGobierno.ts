// Compartido entre el formulario, la lista del back office y el catálogo
// público — evita que las categorías y los años queden formateados o
// listados distinto según la pantalla.

export const CATEGORIAS_OBRA = [
  "EDUCACION",
  "SALUD",
  "VIALIDAD",
  "VIVIENDA",
  "DEPORTE",
  "AGUA_SANEAMIENTO",
  "ELECTRICIDAD",
  "SEGURIDAD",
  "OTRA",
];

export function formatearCategoriaObra(categoria: string): string {
  const texto = categoria.toLowerCase().replace("_", " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Años de los gobiernos de Leonel Fernández: 1996-2000 y 2004-2012 (excluye
// 2001-2003, período de Hipólito Mejía).
export const ANIOS_OBRA_GOBIERNO = [1996, 1997, 1998, 1999, 2000, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012];
