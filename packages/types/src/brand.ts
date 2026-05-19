/**
 * Branded type utility.
 *
 * A "brand" is a phantom marker that makes two structurally identical types
 * (e.g. two strings) distinguishable to the TypeScript compiler. At runtime
 * the values are plain strings; at compile time, a `WellId` cannot be passed
 * where a `JobId` is expected.
 *
 * Why this matters here: the domain model has dozens of identifier types
 * (JobId, WellId, TenantId, SensorId, EquipmentId, TagId...). They are all
 * strings. Without branding, accidentally swapping two of them is a silent
 * bug that only surfaces at runtime in a wrong-table query. With branding,
 * the compiler catches it.
 *
 * Engineering doc §8 — "TypeScript estricto. Los tipos son contratos."
 */
declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Construct a branded value. Use sparingly, at boundaries (DB read, API parse). */
export const brand = <T, B extends string>(value: T): Brand<T, B> => value as Brand<T, B>;
