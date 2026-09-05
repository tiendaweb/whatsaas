-- Focus/Command Center: la corrección de CRM que propone el clasificador, estructurada.
--
-- `crm_to_fix` ya existía pero es texto libre: sirve para leerlo, no para
-- aplicarlo. Esta columna guarda la MISMA propuesta en forma accionable
-- (etapa, etiquetas a sumar/sacar, campos) para que la ficha pueda ofrecer un
-- botón que la ejecute, en vez de obligar a repetir el cambio a mano.
--
-- Aditiva y nullable: las 1.000+ filas ya clasificadas siguen valiendo, sólo
-- que muestran el texto sin botón hasta que se las vuelva a clasificar.
ALTER TABLE "team_commercial_analysis" ADD COLUMN IF NOT EXISTS "crm_fix" jsonb;
