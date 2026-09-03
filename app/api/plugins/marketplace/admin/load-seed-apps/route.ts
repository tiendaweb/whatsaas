import { NextResponse } from "next/server";
import { getMarketplaceAdminContext } from "../../_lib/context";
import { SEED_APPS, SEED_MARKETPLACE_SERVICES, seedApps, seedDefaultApps, seedMarketplaceServices } from "@/lib/db/seed-apps";

export async function POST() {
  const context = await getMarketplaceAdminContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  try {
    // Cargar apps de ejemplo
    await seedApps();

    // Cargar mejoras y servicios del marketplace
    await seedMarketplaceServices();

    // Cargar apps por defecto (Notas y Calendario)
    await seedDefaultApps();

    return NextResponse.json(
      {
        success: true,
        message: `Apps de ejemplo cargadas exitosamente (${SEED_APPS.length + SEED_MARKETPLACE_SERVICES.length} apps + 2 por defecto)`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error cargando apps:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
