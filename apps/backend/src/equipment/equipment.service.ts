import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CallerContext } from '../common/caller-context';

/**
 * Allowed values for `measurement_units.status` — mirrors the CHECK constraint
 * declared in `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql`
 * (CHECK `(status IN ('active', 'inactive', 'offline', 'maintenance'))`). Prisma
 * does not model CHECK constraints, so this is the application-side mirror used
 * for query-filter validation.
 */
export const MEASUREMENT_UNIT_STATUSES = ['active', 'inactive', 'offline', 'maintenance'] as const;
export type MeasurementUnitStatus = (typeof MEASUREMENT_UNIT_STATUSES)[number];

/**
 * Allowed values for `measurement_units.operating_profile` — mirrors the CHECK
 * constraint (`operating_profile IN ('high_pressure_high_flow', 'medium', 'low', 'custom')`).
 */
export const MEASUREMENT_UNIT_OPERATING_PROFILES = [
  'high_pressure_high_flow',
  'medium',
  'low',
  'custom',
] as const;
export type MeasurementUnitOperatingProfile = (typeof MEASUREMENT_UNIT_OPERATING_PROFILES)[number];

interface FindUnitsFilter {
  /** Optional manual tenant filter (UUID). Honored only when CallerContext has no derived tenantId. */
  tenantId?: string;
  /** Optional equipment-type filter (UUID). */
  equipmentTypeId?: string;
  /** Optional CHECK-constrained status filter. */
  status?: MeasurementUnitStatus;
  /** Optional CHECK-constrained operating-profile filter. */
  operatingProfile?: MeasurementUnitOperatingProfile;
}

/**
 * Detail include for a single MeasurementUnit (F4 §D / §E / §G):
 *   - equipmentType: full template row.
 *   - sensors: ordered by instrument tag, each with its currently-installed
 *     transmitter device(s) (`installation_status = 'installed'`).
 *   - unitConfigurations: only the current row (`is_current = true`).
 *   - unitOperatingEnvelopes: only the current row.
 *   - alarmRules: only the current rules (`is_current = true`), each joined
 *     with a small canonical-tag scalar so the response is self-describing.
 *
 * Intentionally excluded: telemetry_readings, alarm_events, jobs,
 * commissioning_snapshots, integration_mappings. Those belong to F4.4E,
 * F4.4F, and F4.6 respectively.
 */
const UNIT_DETAIL_INCLUDE = {
  equipmentType: true,
  sensors: {
    orderBy: { instrumentTag: 'asc' as const },
    include: {
      transmitterDevices: {
        where: { installationStatus: 'installed' },
        orderBy: { installedAt: 'desc' as const },
      },
    },
  },
  unitConfigurations: {
    where: { isCurrent: true },
    take: 1,
  },
  unitOperatingEnvelopes: {
    where: { isCurrent: true },
    take: 1,
  },
  alarmRules: {
    where: { isCurrent: true },
    orderBy: [{ canonicalTagId: 'asc' as const }, { severity: 'asc' as const }],
    include: {
      canonicalTag: {
        select: {
          id: true,
          name: true,
          displayName: true,
          canonicalUnit: true,
          category: true,
        },
      },
    },
  },
};

/**
 * EquipmentService — the F4 catalog surface:
 *   - EquipmentType (template, not tenant-scoped; F4 §D EquipmentType).
 *   - MeasurementUnit (tenant-scoped concrete asset; F4 §D MeasurementUnit;
 *     ADR-007 §1).
 *
 * Read-only in F4.4D. The CallerContext.tenantId scoping seam is preserved
 * verbatim from F4.4A / F4.4B so the filter constrains a logged-in caller
 * once authentication lands; `SystemContext` returns every unit today.
 */
@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- EquipmentType (global, not tenant-scoped) ----

  findTypes() {
    return this.prisma.equipmentType.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findTypeById(id: string) {
    const type = await this.prisma.equipmentType.findUnique({ where: { id } });
    if (!type) {
      throw new NotFoundException(`Equipment type '${id}' not found.`);
    }
    return type;
  }

  // ---- MeasurementUnit (tenant-scoped) ----

  findUnits(ctx: CallerContext, filter: FindUnitsFilter = {}) {
    const tenantId = ctx.tenantId ?? filter.tenantId;
    return this.prisma.measurementUnit.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(filter.equipmentTypeId ? { equipmentTypeId: filter.equipmentTypeId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.operatingProfile ? { operatingProfile: filter.operatingProfile } : {}),
      },
      include: {
        equipmentType: { select: { id: true, name: true, pidReference: true } },
      },
      orderBy: [{ tenantId: 'asc' }, { code: 'asc' }],
    });
  }

  async findUnitById(ctx: CallerContext, id: string) {
    const unit = await this.prisma.measurementUnit.findUnique({
      where: { id },
      include: UNIT_DETAIL_INCLUDE,
    });
    if (!unit || (ctx.tenantId && unit.tenantId !== ctx.tenantId)) {
      throw new NotFoundException(`Measurement unit '${id}' not found.`);
    }
    return unit;
  }
}
