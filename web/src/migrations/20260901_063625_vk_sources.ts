import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "institutions_vk_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"owner_id" numeric
  );
  
  CREATE TABLE "_institutions_v_version_vk_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"owner_id" numeric,
  	"_uuid" varchar
  );
  
  ALTER TABLE "institutions_vk_sources" ADD CONSTRAINT "institutions_vk_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_institutions_v_version_vk_sources" ADD CONSTRAINT "_institutions_v_version_vk_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_institutions_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "institutions_vk_sources_order_idx" ON "institutions_vk_sources" USING btree ("_order");
  CREATE INDEX "institutions_vk_sources_parent_id_idx" ON "institutions_vk_sources" USING btree ("_parent_id");
  CREATE INDEX "_institutions_v_version_vk_sources_order_idx" ON "_institutions_v_version_vk_sources" USING btree ("_order");
  CREATE INDEX "_institutions_v_version_vk_sources_parent_id_idx" ON "_institutions_v_version_vk_sources" USING btree ("_parent_id");
  ALTER TABLE "institutions" DROP COLUMN "vk_group_url";
  ALTER TABLE "institutions" DROP COLUMN "vk_owner_id";
  ALTER TABLE "_institutions_v" DROP COLUMN "version_vk_group_url";
  ALTER TABLE "_institutions_v" DROP COLUMN "version_vk_owner_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "institutions_vk_sources" CASCADE;
  DROP TABLE "_institutions_v_version_vk_sources" CASCADE;
  ALTER TABLE "institutions" ADD COLUMN "vk_group_url" varchar;
  ALTER TABLE "institutions" ADD COLUMN "vk_owner_id" numeric;
  ALTER TABLE "_institutions_v" ADD COLUMN "version_vk_group_url" varchar;
  ALTER TABLE "_institutions_v" ADD COLUMN "version_vk_owner_id" numeric;`)
}
