import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CanonicalTag } from '@prisma/client';

interface FindAllFilter {
  /** Optional equality filter on `canonical_tags.category` (e.g. 'pressure'). */
  category?: string;
  /** Optional equality filter on `canonical_tags.canonical_unit` (e.g. 'psi'). */
  canonicalUnit?: string;
  /** Optional filter on `canonical_tags.deprecated`. When omitted, every row is returned. */
  deprecated?: boolean;
}

/**
 * CanonicalTagsService — the RVF-governed dictionary (F4 §C; ADR-003 / ADR-004).
 *
 * Global, NOT tenant-scoped: the meaning of an existing tag is fixed forever;
 * new tags can be added with care. F4.4C is read-only — name remains the
 * stable business key (`name @unique`), `deprecated = false` is the "active"
 * marker (F1's `active` boolean was renamed/inverted in F4).
 *
 * Write paths (`deprecate`, `rename`) are not exposed; they will return
 * behind a guarded service that refuses if the tag is referenced by any
 * sensor binding or commissioning snapshot.
 */
@Injectable()
export class CanonicalTagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filter: FindAllFilter = {}): Promise<CanonicalTag[]> {
    return this.prisma.canonicalTag.findMany({
      where: {
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.canonicalUnit ? { canonicalUnit: filter.canonicalUnit } : {}),
        ...(filter.deprecated !== undefined ? { deprecated: filter.deprecated } : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findByName(name: string): Promise<CanonicalTag> {
    const tag = await this.prisma.canonicalTag.findUnique({ where: { name } });
    if (!tag) {
      throw new NotFoundException(`Canonical tag '${name}' not found.`);
    }
    return tag;
  }
}
