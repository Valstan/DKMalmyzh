import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_institutions_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__institutions_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_posts_type" AS ENUM('news', 'event');
  CREATE TYPE "public"."enum__posts_v_version_type" AS ENUM('news', 'event');
  CREATE TABLE "institutions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"short_title" varchar,
  	"settlement" varchar,
  	"description" varchar,
  	"content" jsonb,
  	"address" varchar,
  	"phone" varchar,
  	"vk_group_url" varchar,
  	"vk_group_id" numeric,
  	"is_head" boolean DEFAULT false,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_institutions_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_institutions_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_short_title" varchar,
  	"version_settlement" varchar,
  	"version_description" varchar,
  	"version_content" jsonb,
  	"version_address" varchar,
  	"version_phone" varchar,
  	"version_vk_group_url" varchar,
  	"version_vk_group_id" numeric,
  	"version_is_head" boolean DEFAULT false,
  	"version_slug" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__institutions_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "posts" ADD COLUMN "institution_id" integer;
  ALTER TABLE "posts" ADD COLUMN "type" "enum_posts_type" DEFAULT 'news';
  ALTER TABLE "_posts_v" ADD COLUMN "version_institution_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_type" "enum__posts_v_version_type" DEFAULT 'news';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "institutions_id" integer;
  ALTER TABLE "_institutions_v" ADD CONSTRAINT "_institutions_v_parent_id_institutions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "institutions_slug_idx" ON "institutions" USING btree ("slug");
  CREATE INDEX "institutions_updated_at_idx" ON "institutions" USING btree ("updated_at");
  CREATE INDEX "institutions_created_at_idx" ON "institutions" USING btree ("created_at");
  CREATE INDEX "institutions__status_idx" ON "institutions" USING btree ("_status");
  CREATE INDEX "_institutions_v_parent_idx" ON "_institutions_v" USING btree ("parent_id");
  CREATE INDEX "_institutions_v_version_version_slug_idx" ON "_institutions_v" USING btree ("version_slug");
  CREATE INDEX "_institutions_v_version_version_updated_at_idx" ON "_institutions_v" USING btree ("version_updated_at");
  CREATE INDEX "_institutions_v_version_version_created_at_idx" ON "_institutions_v" USING btree ("version_created_at");
  CREATE INDEX "_institutions_v_version_version__status_idx" ON "_institutions_v" USING btree ("version__status");
  CREATE INDEX "_institutions_v_created_at_idx" ON "_institutions_v" USING btree ("created_at");
  CREATE INDEX "_institutions_v_updated_at_idx" ON "_institutions_v" USING btree ("updated_at");
  CREATE INDEX "_institutions_v_latest_idx" ON "_institutions_v" USING btree ("latest");
  ALTER TABLE "posts" ADD CONSTRAINT "posts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_institution_id_institutions_id_fk" FOREIGN KEY ("version_institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_institutions_fk" FOREIGN KEY ("institutions_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_institution_idx" ON "posts" USING btree ("institution_id");
  CREATE INDEX "_posts_v_version_version_institution_idx" ON "_posts_v" USING btree ("version_institution_id");
  CREATE INDEX "payload_locked_documents_rels_institutions_id_idx" ON "payload_locked_documents_rels" USING btree ("institutions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "institutions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_institutions_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "institutions" CASCADE;
  DROP TABLE "_institutions_v" CASCADE;
  ALTER TABLE "posts" DROP CONSTRAINT "posts_institution_id_institutions_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT "_posts_v_version_institution_id_institutions_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_institutions_fk";
  
  DROP INDEX "posts_institution_idx";
  DROP INDEX "_posts_v_version_version_institution_idx";
  DROP INDEX "payload_locked_documents_rels_institutions_id_idx";
  ALTER TABLE "posts" DROP COLUMN "institution_id";
  ALTER TABLE "posts" DROP COLUMN "type";
  ALTER TABLE "_posts_v" DROP COLUMN "version_institution_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_type";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "institutions_id";
  DROP TYPE "public"."enum_institutions_status";
  DROP TYPE "public"."enum__institutions_v_version_status";
  DROP TYPE "public"."enum_posts_type";
  DROP TYPE "public"."enum__posts_v_version_type";`)
}
