import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EquipmentCategory } from '@prisma/client';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { EquipmentService } from './equipment.service';

const UnitsQuerySchema = z
  .object({
    typeCode: z.string().min(1).max(64).optional(),
    category: z.nativeEnum(EquipmentCategory).optional(),
  })
  .strict();

@ApiTags('equipment')
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Get('types')
  @ApiOperation({
    summary: 'List equipment type templates',
    description: 'EMMAD / EMGAD / future categories (ADR-004 §7). Not tenant-scoped.',
  })
  listTypes() {
    return this.equipment.findTypes();
  }

  @Get('types/:code')
  @ApiOperation({ summary: 'Get a single equipment type by code' })
  @ApiParam({ name: 'code', example: 'EMMAD' })
  oneType(@Param('code') code: string) {
    return this.equipment.findTypeByCode(code);
  }

  @Get('units')
  @ApiOperation({
    summary: 'List equipment units',
    description: 'Concrete RVF assets (EMMAD-01, EMGAD-04, …). Reusable across jobs.',
  })
  @ApiQuery({ name: 'typeCode', required: false, example: 'EMMAD' })
  @ApiQuery({ name: 'category', required: false, enum: EquipmentCategory })
  listUnits(
    @Query(new ZodValidationPipe(UnitsQuerySchema)) query: z.infer<typeof UnitsQuerySchema>,
  ) {
    return this.equipment.findUnits(query);
  }

  @Get('units/:code')
  @ApiOperation({
    summary: 'Get a single equipment unit by code',
    description: 'Includes its sensors and any attached SignalFire devices.',
  })
  @ApiParam({ name: 'code', example: 'EMMAD-01' })
  oneUnit(@Param('code') code: string) {
    return this.equipment.findUnitByCode(code);
  }
}
