/** Regras financeiras oficiais do Aura Beat. Todos os valores são em BRL. */
export const PLATFORM_FEE_RATE = 0.03;

export type TravelModel = "one_way" | "round_trip";

export interface BookingPriceInput {
  hourlyFee: number;
  durationMinutes: number;
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

const money = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const positive = (value = 0) => Math.max(0, Number(value) || 0);

export function calculateBookingPrice(input: BookingPriceInput): BookingPriceBreakdown {
  const hourlyFee = positive(input.hourlyFee);
  const durationMinutes = positive(input.durationMinutes);
  const performanceFee = money(hourlyFee * (durationMinutes / 60));
  const venuePlatformFee = money(performanceFee * PLATFORM_FEE_RATE);
  const artistPlatformFee = money(performanceFee * PLATFORM_FEE_RATE);
  const legMultiplier = input.travelModel === "one_way" ? 1 : 2;
  const billableDistanceKm = money(
    Math.max(0, positive(input.distanceKm) - positive(input.freeRadiusKm)) * legMultiplier,
  );
  const travelAmount = money(billableDistanceKm * positive(input.pricePerKm));
  const tollAmount = money(positive(input.tollAmount));
  const lodgingAmount = money(positive(input.lodgingAmount));

  return {
    performanceFee,
    venuePlatformFee,
    artistPlatformFee,
    billableDistanceKm,
    travelAmount,
    tollAmount,
    lodgingAmount,
    venueTotal: money(performanceFee + venuePlatformFee + travelAmount + tollAmount + lodgingAmount),
    artistNet: money(performanceFee - artistPlatformFee + travelAmount + tollAmount + lodgingAmount),
  };
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
