-- El CHECK (balance >= -credit_limit) es incompatible con la política de deuda:
-- cuando un cliente final YA pagó al reseller (una renovación), la activación no se
-- puede revertir aunque el reseller se haya quedado sin saldo. Ese caso deja el
-- balance por debajo del límite a propósito y marca la transacción como pending_debt.
--
-- La invariante del camino normal (no sobregirar sin permiso) la garantiza
-- debitWallet() en lib/resellers/wallet.ts con SELECT ... FOR UPDATE + validación
-- explícita antes de insertar, que es donde sí se puede distinguir el caso.
ALTER TABLE reseller_wallets DROP CONSTRAINT IF EXISTS reseller_wallets_balance_chk;
