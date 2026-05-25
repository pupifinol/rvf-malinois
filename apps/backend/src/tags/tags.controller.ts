import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { CanonicalTagsService } from './tags.service';

// The query schema keeps `deprecated` as a string-enum because
// `ZodValidationPipe` types its schema as `ZodSchema<T>` (input = output = T),
// which is incompatible with a Zod `.transform()` that narrows from string to
// boolean. The controller does the string → boolean conversion when handing
// the filter to the service.
const ListQuerySchema = z
  .object({
    category: z.string().min(1).max(60).optional(),
    canonicalUnit: z.string().min(1).max(60).optional(),
    deprecated: z.enum(['true', 'false']).optional(),
  })
  .strict();

@ApiTags('canonical-tags')
@Controller('tags')
export class CanonicalTagsController {
  constructor(private readonly tags: CanonicalTagsService) {}

  @Get()
  @ApiOperation({
    summary: 'List the canonical tag dictionary',
    description:
      "RVF's global canonical tag list (F4 §C; ADR-003). The dictionary is not " +
      'tenant-scoped. Optional filters: `category` (e.g. pressure), ' +
      '`canonicalUnit` (e.g. psi), `deprecated` (`true` | `false`). Ordered by ' +
      '`(category asc, name asc)`.',
  })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'canonicalUnit', required: false })
  @ApiQuery({ name: 'deprecated', required: false, enum: ['true', 'false'] })
  list(@Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>) {
    return this.tags.findAll({
      category: query.category,
      canonicalUnit: query.canonicalUnit,
      deprecated: query.deprecated === undefined ? undefined : query.deprecated === 'true',
    });
  }

  @Get(':name')
  @ApiOperation({
    summary: 'Get a canonical tag by its name',
    description:
      '`name` is the stable business key (lowercase snake_case, e.g. `p_inlet`, ' +
      '`q_gas`, `level_separator`). 404 if the name is not in the dictionary.',
  })
  @ApiParam({ name: 'name', example: 'p_inlet' })
  one(@Param('name') name: string) {
    return this.tags.findByName(name);
  }
}
