import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { SystemContext } from '../common/caller-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import {
  EquipmentService,
  MEASUREMENT_UNIT_OPERATING_PROFILES,
  MEASUREMENT_UNIT_STATUSES,
} from './equipment.service';

const UnitsQuerySchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    equipmentTypeId: z.string().uuid().optional(),
    status: z.enum(MEASUREMENT_UNIT_STATUSES).optional(),
    operatingProfile: z.enum(MEASUREMENT_UNIT_OPERATING_PROFILES).optional(),
  })
  .strict();

@ApiTags('equipment')
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  // ---- EquipmentType ----

  @Get('types')
  @ApiOperation({
    summary: 'List equipment type templates',
    description:
      'F4 §D EquipmentType. Templates are global (not tenant-scoped). Returned ' +
      'ordered by `name asc`. F4 dropped the F1 `category` enum; per-type ' +
      'distinctions live in `defaultSensorTemplate` and `description`.',
  })
  listTypes() {
    return this.equipment.findTypes();
  }

  @Get('types/:id')
  @ApiOperation({ summary: 'Get an equipment type by its UUID' })
  @ApiParam({ name: 'id', example: '00000000-0000-0000-0000-0000000044d1', description: 'UUID' })
  oneType(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.equipment.findTypeById(id);
  }

  // ---- MeasurementUnit ----

  @Get('units')
  @ApiOperation({
    summary: 'List measurement units',
    description:
      'F4 §D MeasurementUnit. Tenant-scoped. Optional filters: `tenantId` (UUID), ' +
      '`equipmentTypeId` (UUID), `status`, `operatingProfile`. When a server-derived ' +
      'tenant scope is set on the caller context, the `tenantId` query parameter ' +
      'is ignored. Ordered by `(tenantId asc, code asc)`. The list endpoint returns ' +
      'each unit with a small `equipmentType` summary; full detail (sensors, ' +
      'current configuration / envelope / alarm rules) comes back on the by-id ' +
      'endpoint to keep list responses small.',
  })
  @ApiQuery({ name: 'tenantId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'equipmentTypeId', required: false, description: 'UUID' })
  @ApiQuery({ name: 'status', required: false, enum: MEASUREMENT_UNIT_STATUSES })
  @ApiQuery({
    name: 'operatingProfile',
    required: false,
    enum: MEASUREMENT_UNIT_OPERATING_PROFILES,
  })
  listUnits(
    @Query(new ZodValidationPipe(UnitsQuerySchema)) query: z.infer<typeof UnitsQuerySchema>,
  ) {
    return this.equipment.findUnits(SystemContext, query);
  }

  @Get('units/:id')
  @ApiOperation({
    summary: 'Get a measurement unit by its UUID',
    description:
      'Detail response includes: the equipment type, the unit sensors (each ' +
      'with currently-installed transmitter devices, `installation_status = installed`), ' +
      'the current `unitConfiguration`, the current `unitOperatingEnvelope`, and ' +
      'the current per-tag alarm rules joined with a canonical-tag scalar. ' +
      'Telemetry readings, live readings, alarm events, jobs, and commissioning ' +
      'snapshots are NOT included (F4.4E, F4.4F, F4.6 own those reads).',
  })
  @ApiParam({ name: 'id', example: '00000000-0000-0000-0000-000000004411', description: 'UUID' })
  oneUnit(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.equipment.findUnitById(SystemContext, id);
  }
}
