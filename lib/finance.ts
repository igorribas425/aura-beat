/** Regras financeiras oficiais do Aura Beat. Todos os valores são em BRL. */

export const PLATFORM_FEE_RATE = 0.03;

export type TravelModel =
  | "one_way"
  | "round_trip";

export interface BookingPriceInput {
  hourlyFee: number;
  durationMinutes: number;

  /**
   * Normal:
   * Casa paga 3%
   * Artista paga 0%
   *
   * Urgente:
   * Casa paga 3%
   * Artista paga 3%
   */
  isUrgent?: boolean;

  distanceKm?: number;
  freeRadiusKm?: number;
  pricePerKm?: number;
  travelModel?: TravelModel;

  tollAmount?: number;
  lodgingAmount?: number;
}

export interface BookingPriceBreakdown {
  performanceFee: number;

  venuePlatformFee: number;
  artistPlatformFee: number;

  billableDistanceKm: number;

  travelAmount: number;
  tollAmount: number;
  lodgingAmount: number;

  venueTotal: number;
  artistNet: number;
}

const money = (
  value: number
) =>
  Math.round(
    (
      Number.isFinite(value)
        ? value
        : 0
    ) * 100
  ) / 100;

const positive = (
  value = 0
) =>
  Math.max(
    0,
    Number(value) || 0
  );

export function calculateBookingPrice(
  input: BookingPriceInput
): BookingPriceBreakdown {
  const hourlyFee =
    positive(
      input.hourlyFee
    );

  const durationMinutes =
    positive(
      input.durationMinutes
    );

  const performanceFee =
    money(
      hourlyFee *
        (
          durationMinutes /
          60
        )
    );

  /**
   * A Casa sempre paga
   * 3% sobre o cachê.
   */
  const venuePlatformFee =
    money(
      performanceFee *
        PLATFORM_FEE_RATE
    );

  /**
   * O DJ só paga 3%
   * quando a contratação
   * for urgente.
   */
  const artistPlatformFee =
    input.isUrgent === true
      ? money(
          performanceFee *
            PLATFORM_FEE_RATE
        )
      : 0;

  const legMultiplier =
    input.travelModel ===
    "one_way"
      ? 1
      : 2;

  const billableDistanceKm =
    money(
      Math.max(
        0,
        positive(
          input.distanceKm
        ) -
          positive(
            input.freeRadiusKm
          )
      ) *
        legMultiplier
    );

  /**
   * Comissão NÃO incide
   * sobre deslocamento.
   */
  const travelAmount =
    money(
      billableDistanceKm *
        positive(
          input.pricePerKm
        )
    );

  /**
   * Comissão NÃO incide
   * sobre pedágio.
   */
  const tollAmount =
    money(
      positive(
        input.tollAmount
      )
    );

  /**
   * Comissão NÃO incide
   * sobre hospedagem.
   */
  const lodgingAmount =
    money(
      positive(
        input.lodgingAmount
      )
    );

  /**
   * Total pago pela Casa:
   *
   * cachê
   * + taxa Casa
   * + deslocamento
   * + pedágio
   * + hospedagem
   */
  const venueTotal =
    money(
      performanceFee +
        venuePlatformFee +
        travelAmount +
        tollAmount +
        lodgingAmount
    );

  /**
   * Total do artista:
   *
   * cachê
   * - taxa DJ somente
   *   se urgente
   * + extras
   */
  const artistNet =
    money(
      performanceFee -
        artistPlatformFee +
        travelAmount +
        tollAmount +
        lodgingAmount
    );

  return {
    performanceFee,

    venuePlatformFee,
    artistPlatformFee,

    billableDistanceKm,

    travelAmount,
    tollAmount,
    lodgingAmount,

    venueTotal,
    artistNet,
  };
}

export function formatBRL(
  value: number
): string {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  ).format(
    Number(value || 0)
  );
}