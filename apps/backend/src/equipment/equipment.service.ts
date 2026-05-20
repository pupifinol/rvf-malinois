import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { EquipmentCategory, EquipmentType, EquipmentUnit } from '@prisma/client';

interface FindUnitsFilter {
  typeCode?: string;
  category?: EquipmentCategory;
}

/**
 * EquipmentService — covers the three-tier equipment catalog from ADR-004:
 *   - EquipmentType (template, e.g. EMMAD / EMGAD)
 *   - EquipmentUnit (concrete RVF asset, e.g. EMMAD-01)
 *   - Sensor       (per-unit, with three-tag traceability)
 *
 * Catalog rows are NOT tenant-scoped — they're RVF assets. Tenant linkage
 * happens only via a Job (operation), not via the catalog.
 */
@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  findTypes(): Promise<EquipmentType[]> {
    return this.prisma.equipmentType.findMany({ orderBy: { code: 'asc' } });
  }

  async findTypeByCode(code: string): Promise<EquipmentType> {
    const type = await this.prisma.equipmentType.findUnique({
      where: { code },
      include: { units: { select: { id: true, code: true, serialNumber: true } } },
    });
    if (!type) {
      throw new NotFoundException(`Equipment type '${code}' not found.`);
    }
    return type;
  }

  async findUnits(filter: FindUnitsFilter = {}): Promise<EquipmentUnit[]> {
    let typeId: string | undefined;
    if (filter.typeCode) {
      const type = await this.prisma.equipmentType.findUnique({
        where: { code: filter.typeCode },
        select: { id: true },
      });
      if (!type) {
        throw new NotFoundException(`Equipment type '${filter.typeCode}' not found.`);
      }
      typeId = type.id;
    }

    return this.prisma.equipmentUnit.findMany({
      where: {
        ...(typeId ? { equipmentTypeId: typeId } : {}),
        ...(filter.category ? { equipmentType: { category: filter.category } } : {}),
      },
      include: {
        equipmentType: { select: { code: true, name: true, category: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findUnitByCode(code: string): Promise<EquipmentUnit> {
    const unit = await this.prisma.equipmentUnit.findUnique({
      where: { code },
      include: {
        equipmentType: { select: { code: true, name: true, category: true, pidReference: true } },
        sensors: {
          orderBy: { instrumentTag: 'asc' },
          include: { signalFireDevice: true },
        },
      },
    });
    if (!unit) {
      throw new NotFoundException(`Equipment unit '${code}' not found.`);
    }
    return unit;
  }
}
