import { getElasticsearchClient } from '../config/elasticsearch.js';
import { emailRepository } from '../repositories/emailRepository.js';
import { prisma } from '../config/prisma.js';
import { Email, EmailStatus } from '@prisma/client';

export const ELASTICSEARCH_EMAIL_INDEX = 'mailflow-emails';

export interface IndexedEmailDocument {
  id: string;
  userId: string;
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  lastError?: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchEmailsOptions {
  userId: string;
  query?: string;
  status?: EmailStatus;
  page?: number;
  limit?: number;
}

export interface SearchEmailsResult {
  results: IndexedEmailDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Elasticsearch explicit index mapping definition for mailflow-emails.
 */
const EMAIL_INDEX_MAPPING = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      userId: { type: 'keyword' },
      campaignId: { type: 'keyword' },
      senderId: { type: 'keyword' },
      recipientEmail: {
        type: 'keyword',
        fields: {
          text: { type: 'text' },
        },
      },
      recipientName: { type: 'text' },
      subject: { type: 'text' },
      body: { type: 'text' },
      status: { type: 'keyword' },
      scheduledAt: { type: 'date' },
      sentAt: { type: 'date' },
      lastError: { type: 'text' },
      attempts: { type: 'integer' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
};

export const elasticsearchService = {
  /**
   * Ensures the mailflow-emails index exists in Elasticsearch with explicit mapping.
   * Safe to call on startup — will NOT overwrite or recreate existing indices.
   */
  async ensureEmailIndex(): Promise<void> {
    try {
      const client = getElasticsearchClient();
      const exists = await client.indices.exists({ index: ELASTICSEARCH_EMAIL_INDEX });

      if (!exists) {
        await client.indices.create({
          index: ELASTICSEARCH_EMAIL_INDEX,
          mappings: EMAIL_INDEX_MAPPING.mappings as any,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[elasticsearch] Failed to ensure index '${ELASTICSEARCH_EMAIL_INDEX}': ${msg}`);
    }
  },

  /**
   * Transforms a PostgreSQL Email record into an Elasticsearch IndexedEmailDocument.
   */
  async formatEmailDocument(email: any): Promise<IndexedEmailDocument | null> {
    let fullEmail = email;

    if (!email.campaign?.userId) {
      fullEmail = await emailRepository.findById(email.id);
    }

    if (!fullEmail || !fullEmail.campaign?.userId) {
      console.warn(`[elasticsearch] Cannot index email ${email.id}: Missing associated campaign/user relationship.`);
      return null;
    }

    return {
      id: fullEmail.id,
      userId: fullEmail.campaign.userId,
      campaignId: fullEmail.campaignId,
      senderId: fullEmail.senderId,
      recipientEmail: fullEmail.recipientEmail,
      recipientName: fullEmail.recipientName || null,
      subject: fullEmail.subject || '',
      body: fullEmail.body || '',
      status: fullEmail.status,
      scheduledAt: new Date(fullEmail.scheduledAt).toISOString(),
      sentAt: fullEmail.sentAt ? new Date(fullEmail.sentAt).toISOString() : null,
      lastError: fullEmail.lastError || null,
      attempts: fullEmail.attempts || 0,
      createdAt: new Date(fullEmail.createdAt).toISOString(),
      updatedAt: new Date(fullEmail.updatedAt).toISOString(),
    };
  },

  /**
   * Indexes or replaces an Email document in Elasticsearch using email.id as document ID.
   *
   * PostgreSQL remains source of truth; Elasticsearch failure will not throw or break callers.
   */
  async indexEmail(emailOrId: Email | string): Promise<void> {
    try {
      await this.ensureEmailIndex();

      let emailDoc: IndexedEmailDocument | null = null;
      if (typeof emailOrId === 'string') {
        const email = await emailRepository.findById(emailOrId);
        if (email) {
          emailDoc = await this.formatEmailDocument(email);
        }
      } else {
        emailDoc = await this.formatEmailDocument(emailOrId);
      }

      if (!emailDoc) {
        return;
      }

      const client = getElasticsearchClient();
      await client.index({
        index: ELASTICSEARCH_EMAIL_INDEX,
        id: emailDoc.id,
        document: emailDoc,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[elasticsearch] Failed to index email: ${msg}`);
    }
  },

  /**
   * Partially updates an existing Email document in Elasticsearch.
   */
  async updateEmailDocument(id: string, partialDoc: Record<string, any>): Promise<void> {
    try {
      const client = getElasticsearchClient();
      await client.update({
        index: ELASTICSEARCH_EMAIL_INDEX,
        id,
        doc: {
          ...partialDoc,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[elasticsearch] Failed to update document ${id}: ${msg}`);
    }
  },

  /**
   * Performs full-text search across indexed emails with strict user isolation.
   */
  async searchEmails(options: SearchEmailsOptions): Promise<SearchEmailsResult> {
    await this.ensureEmailIndex();

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const from = (page - 1) * limit;

    const must: any[] = [
      { term: { userId: options.userId } }, // STRICT USER ISOLATION
    ];

    if (options.status) {
      must.push({ term: { status: options.status } });
    }

    if (options.query && options.query.trim()) {
      const q = options.query.trim();
      must.push({
        multi_match: {
          query: q,
          fields: ['recipientEmail.text^3', 'recipientEmail^3', 'recipientName^2', 'subject^2', 'body'],
          fuzziness: 'AUTO',
        },
      });
    }

    try {
      const client = getElasticsearchClient();
      const response = await client.search<IndexedEmailDocument>({
        index: ELASTICSEARCH_EMAIL_INDEX,
        from,
        size: limit,
        query: {
          bool: {
            must,
          },
        },
        sort: [{ scheduledAt: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
      });

      const hits = response.hits.hits.map((hit) => hit._source as IndexedEmailDocument);
      const totalNum =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0;

      return {
        results: hits,
        total: totalNum,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalNum / limit)),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[elasticsearch] Search query failed: ${msg}`);
      return {
        results: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
      };
    }
  },

  /**
   * Reindexes all emails from PostgreSQL into Elasticsearch.
   * Useful for initialization, environment reset, or recovery.
   */
  async reindexAllEmailsFromPostgres(): Promise<{ totalIndexed: number }> {
    await this.ensureEmailIndex();

    const emails = await prisma.email.findMany({
      include: {
        campaign: {
          select: { userId: true },
        },
      },
    });

    let indexedCount = 0;

    for (const email of emails) {
      const doc = await this.formatEmailDocument(email);
      if (doc) {
        const client = getElasticsearchClient();
        await client.index({
          index: ELASTICSEARCH_EMAIL_INDEX,
          id: doc.id,
          document: doc,
        });
        indexedCount++;
      }
    }

    return { totalIndexed: indexedCount };
  },
};
