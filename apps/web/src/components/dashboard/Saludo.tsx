"use client";

function saludoPorHora(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function Saludo({ nombre }: { nombre?: string }) {
  const primerNombre = nombre?.split(" ")[0];
  const fecha = new Date().toLocaleDateString("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      <h1 className="text-xl font-bold text-institucional-900">
        {saludoPorHora()}{primerNombre ? `, ${primerNombre}` : ""}
      </h1>
      <p className="text-sm capitalize text-gray-500">{fecha}</p>
    </div>
  );
}
