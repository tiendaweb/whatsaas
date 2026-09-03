import postgres from "postgres";

if (!process.env.POSTGRES_URL) {
  throw new Error("POSTGRES_URL environment variable is not set");
}

const applyChanges = process.argv.includes("--apply");
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const result = await sql.begin(async (tx) => {
    const rows = await tx`
      select id, nodes
      from automations
      order by id
      for update
    `;
    const startIdsByAutomation = new Map(
      rows.map((row) => [
        Number(row.id),
        new Set(
          (Array.isArray(row.nodes) ? row.nodes : [])
            .filter((node) => node?.type === "start" && typeof node.id === "string")
            .map((node) => node.id),
        ),
      ]),
    );

    let changedReferences = 0;
    let changedAutomations = 0;
    for (const row of rows) {
      let changed = false;
      const nodes = (Array.isArray(row.nodes) ? row.nodes : []).map((node) => {
        if (node?.type !== "go_to_node" || node.data?.mode !== "other_flow") {
          return node;
        }
        const targetAutomationId = Number(node.data.targetAutomationId);
        const targetNodeId = node.data.targetNodeId;
        if (
          !Number.isInteger(targetAutomationId) ||
          !targetNodeId ||
          !startIdsByAutomation.get(targetAutomationId)?.has(targetNodeId)
        ) {
          return node;
        }
        changed = true;
        changedReferences += 1;
        const { targetNodeId: _physicalStartId, ...data } = node.data;
        return { ...node, data };
      });

      if (!changed) continue;
      changedAutomations += 1;
      if (applyChanges) {
        await tx`
          update automations
          set nodes = ${JSON.stringify(nodes)}::jsonb,
              updated_at = now()
          where id = ${row.id}
        `;
      }
    }

    return {
      scannedAutomations: rows.length,
      changedAutomations,
      changedReferences,
    };
  });

  console.log(
    JSON.stringify(
      {
        mode: applyChanges ? "apply" : "dry-run",
        ...result,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
