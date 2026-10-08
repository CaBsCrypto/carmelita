# Privy, cinco redes y activación Stellar Testnet

Estado documentado el **8 de octubre de 2026**, sobre `main` productivo `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`. Carmelita prepara wallets de la identidad autenticada tanto desde su web como durante la autorización OAuth iniciada desde ChatGPT. No exige un ingreso web anterior para que una identidad nueva pueda registrarse y preparar sus wallets.

## Una identidad, tres familias de wallets

| Familia | Redes registradas | Direcciones |
| --- | --- | --- |
| EVM | Avalanche Fuji, Base Sepolia y BNB Testnet | Una misma dirección EVM para las tres redes |
| Solana | Solana Devnet | Dirección propia de Solana |
| Stellar | Stellar Testnet | Dirección propia de Stellar |

Cinco asociaciones de red no significan cinco direcciones distintas. La provisión recupera wallets existentes con claves de idempotencia y valida su propietario; no sustituye direcciones al reconectar. Preparar y registrar EVM o Solana no implica financiar esas redes.

Privy verifica la identidad y custodia las wallets del usuario. Carmelita persiste las asociaciones en Neon y vincula el sujeto OAuth a la identidad verificada. El correo sirve para el registro autenticado; no se usa como sustituto del propietario verificado ni para adjudicar wallets ajenas.

## Activación automática de Stellar

```mermaid
sequenceDiagram
    participant U as Usuario
    participant C as Carmelita
    participant P as Privy
    participant D as Registro y reserva
    participant H as Horizon Testnet
    participant F as Friendbot Testnet
    U->>C: Ingresar o autorizar OAuth
    C->>P: Verificar identidad y resolver wallets
    P-->>C: Wallets propias existentes o nuevas
    C->>D: Persistir la dirección Stellar canónica
    C->>H: Consultar esa misma cuenta
    alt Cuenta existente
        H-->>C: Cuenta activa
    else Ausencia confirmada
        C->>D: Reservar el intento por propietario y dirección
        C->>H: Reconciliar antes de financiar
        C->>F: Activar la misma dirección con XLM Testnet si sigue ausente
        C->>H: Confirmar existencia de la cuenta
    else Lectura indisponible
        C-->>U: Registro conservado; activación no comprobada
    end
    C-->>U: Redes registradas y estado comprobado o pendiente
```

La preparación autorizada sigue este orden:

1. Recupera o crea las wallets propias y persiste la identidad canónica antes de solicitar fondos.
2. Consulta la dirección Stellar en Horizon Testnet. Una cuenta existente no requiere otro Friendbot. Una lectura fallida o desconocida tampoco autoriza financiación.
3. Sólo una ausencia confirmada permite reservar un intento y solicitar XLM Testnet al Friendbot oficial para **esa misma dirección**. Antes de solicitar, reconcilia otra vez por si un intento anterior ya tuvo éxito.
4. Consulta Horizon después del intento. Sólo existencia confirmada permite informar `active`; un HTTP exitoso del faucet o una dirección válida no bastan.
5. Conserva el registro y expresa pendiente o indisponible si falta confirmación. Las reservas persistentes, la actualización condicional y el plazo de reintento evitan un segundo envío inmediato ante solicitudes simultáneas o una respuesta perdida.

La activación depende de Privy, persistencia, Horizon y Friendbot. El flujo tiene plazos acotados; no promete disponibilidad instantánea permanente. Una indisponibilidad debe mostrar el estado real y permitir recuperación posterior con la misma dirección. Las consultas MCP son de lectura: preguntar por una wallet no crea otra ni financia una cuenta por sí solo.

## Registro, activación y saldo son estados distintos

- **Registrada:** Carmelita tiene una asociación persistida y perteneciente a la identidad verificada. La cobertura de cinco redes describe ese registro.
- **Activa en Stellar:** una lectura actual de Horizon confirma existencia de la cuenta. Un estado legacy almacenado no sustituye esa lectura.
- **No activada:** Horizon confirma ausencia; la wallet puede seguir correctamente registrada en Carmelita.
- **Indisponible:** no se pudo comprobar la red. No se presenta como ausencia, activación ni saldo cero.
- **Saldo:** es la lectura observada en la red, separada del registro y de la solicitud de fondos.

`testnetActivation` conserva si se emitió una solicitud y si su resultado está confirmado o incierto. `fundsMoved` es `false` sin solicitud, `true` sólo con hash válido y existencia confirmada, y `null` cuando la recepción no está comprobada. No se convierte una reserva interna en un recibo de entrega.

La auditoría de esta jornada confirmó activación Testnet para el nuevo tester. También encontró dos excepciones legacy: un estado persistido pendiente aunque Horizon mostraba cuenta activa, y una cuenta aún no activa. Esos casos requieren seguimiento; no permiten afirmar que todas las wallets históricas ya estén activas.

## XLM y trustlines

**XLM es el activo nativo de Stellar y no necesita una trustline.** La activación automática crea y financia la cuenta Testnet con XLM de prueba, sin valor real.

USDC es otro activo. Su trustline requiere el issuer exacto y revisión/firma de la operación correspondiente. Crear una wallet, activar XLM o autorizar `agent:read` no aprueba esa trustline ni financia USDC. La integración USDC, DeFindex, compras y firmas tiene aceptación independiente y queda fuera del cierre ChatGPT. Mainnet necesita su propia entrega y autorización; los fondos Testnet no se convierten en fondos Mainnet.

## Recuperación y comprobación

En una sesión vigente, consultar el estado de las wallets permite distinguir registro y comprobación actual de red. Ante una activación incierta, conservar la identidad y dirección y respetar el plazo de reintento. Para registros existentes incompletos, un operador autorizado dispone de [recuperación administrativa](./mvp-closeout/admin-wallet-recovery.md); esa intervención no concede permisos OAuth ni debe crear otra identidad.

Las pruebas `stellar-auto-activation` y `stellar-activation-onboarding` cubren localmente dirección canónica, persistencia, concurrencia, indisponibilidad, respuesta incierta, confirmación y recuperación. Su corrida se registra en la [matriz de aceptación](./mvp-closeout/evidence-matrix.md). No se inducen fallos en producción para probar esos casos.

Mantener secretos Privy/Stytch y credenciales Neon únicamente en configuración privada de servidor. No incluirlos en guías, logs, capturas o respaldos de código. La copia Git y los snapshots no recuperan por sí solos las cuentas de los proveedores ni los datos de Neon.