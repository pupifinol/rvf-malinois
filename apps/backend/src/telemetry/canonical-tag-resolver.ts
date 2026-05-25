import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CanonicalTag } from '@prisma/client';

export interface CanonicalTagLookup {
  id?: string;
  name?: string;
}

/**
 * CanonicalTagResolver — F4.4F.
 *
 * Resolves a canonical tag by UUID or by stable business name against the
 * F4 `canonical_tags` table. The F1 surface (resolution via the active job's
 * `JobSensorSnapshot` + soft `canonicalTagName` lookup) is **retired**: F4
 * decouples telemetry reads from the commissioning snapshot — the reading
 * itself carries `canonical_tag_id` (FK), so the resolver only needs to
 * hydrate the tag metadata for the response payload and accept either form
 * of identifier from the caller.
 *
 * Caching: removed. F1's per-process `Map` cache made sense when every
 * envelope had to traverse `Job → JobSensorSnapshot` on hot ingestion paths.
 * F4 read paths look the row up at most once per query and let PostgreSQL's
 * `canonical_tags_name_key` unique index do the work — no application-layer
 * cache is justified for the F4.4F surface.
 */
@Injectable()
export class CanonicalTagResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(lookup: CanonicalTagLookup): Promise<CanonicalTag> {
    if (lookup.id && lookup.name) {
      // Defence-in-depth: the controller-side Zod schema already rejects this
      // combination, but the service guards independently for callers that
      // bypass the controller (e.g. internal helpers).
      throw new BadRequestException(
        'Provide either `id` or `name`, not both, when resolving a canonical tag.',
      );
    }
    if (lookup.id) {
      const tag = await this.prisma.canonicalTag.findUnique({ where: { id: lookup.id } });
      if (!tag) {
        throw new NotFoundException(`Canonical tag '${lookup.id}' not found.`);
      }
      return tag;
    }
    if (lookup.name) {
      const tag = await this.prisma.canonicalTag.findUnique({ where: { name: lookup.name } });
      if (!tag) {
        throw new NotFoundException(`Canonical tag '${lookup.name}' not found.`);
      }
      return tag;
    }
    throw new BadRequestException('Provide either `id` or `name` to resolve a canonical tag.');
  }
}
