-- CreateEnum
CREATE TYPE "TenantKind" AS ENUM ('rvf_internal', 'client');

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('emmad', 'emgad', 'other');

-- CreateEnum
CREATE TYPE "SensorType" AS ENUM ('pressure_scout', 'sentinel_rtd', 'wireless_totalizer', 'water_cut_analyzer', 'other');

-- CreateEnum
CREATE TYPE "EngineeringUnitClass" AS ENUM ('pressure', 'temperature', 'flow', 'production', 'ratio', 'composition', 'level', 'dimensionless');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('scheduled', 'in_progress', 'closed');

-- CreateEnum
CREATE TYPE "Quality" AS ENUM ('good', 'estimated', 'uncertain', 'bad', 'stale');

-- CreateEnum
CREATE TYPE "AlarmState" AS ENUM ('active', 'acknowledged', 'cleared', 'shelved');

-- CreateEnum
CREATE TYPE "AlarmSeverity" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "AlarmCondition" AS ENUM ('LO_LO', 'LO', 'HI', 'HI_HI', 'RATE', 'DEVIATION', 'NO_DATA');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('rvf_super_admin', 'rvf_admin', 'rvf_operations', 'rvf_field', 'rvf_analyst', 'client_admin', 'client_viewer', 'client_api');

-- CreateEnum
CREATE TYPE "OperationalEventKind" AS ENUM ('job_started', 'job_closed', 'choke_change', 'other');

-- CreateEnum
CREATE TYPE "TelemetryDirection" AS ENUM ('inbound');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" "TenantKind" NOT NULL,
    "data_residency" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wells" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "site_code" VARCHAR(64),
    "well_type" VARCHAR(40),
    "fluid" VARCHAR(40),
    "design_limits" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_types" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" "EquipmentCategory" NOT NULL,
    "expected_sensor_channels" JSONB NOT NULL,
    "pid_reference" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "equipment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_units" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "serial_number" VARCHAR(120) NOT NULL,
    "equipment_type_id" TEXT NOT NULL,
    "pid_reference" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "equipment_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_tags" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "unit_class" "EngineeringUnitClass" NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "expected_range" JSONB,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "canonical_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensors" (
    "id" TEXT NOT NULL,
    "equipment_unit_id" TEXT NOT NULL,
    "instrument_tag" VARCHAR(64) NOT NULL,
    "sensor_type" "SensorType" NOT NULL,
    "modbus_register" INTEGER NOT NULL,
    "canonical_tag_name" VARCHAR(64) NOT NULL,
    "range_low" DOUBLE PRECISION,
    "range_high" DOUBLE PRECISION,
    "serial_number" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signalfire_devices" (
    "id" TEXT NOT NULL,
    "sensor_id" TEXT NOT NULL,
    "device_id" VARCHAR(120) NOT NULL,
    "gateway_id" VARCHAR(120) NOT NULL,
    "radio_profile" VARCHAR(40),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "signalfire_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "well_id" TEXT NOT NULL,
    "equipment_unit_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "status" "JobStatus" NOT NULL DEFAULT 'scheduled',
    "closed_at" TIMESTAMPTZ(6),
    "engineer_user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissioning_snapshots" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "frozen_at" TIMESTAMPTZ(6) NOT NULL,
    "commissioned_by_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "commissioning_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_sensor_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "instrument_tag" VARCHAR(64) NOT NULL,
    "sensor_type" "SensorType" NOT NULL,
    "modbus_register" INTEGER NOT NULL,
    "canonical_tag_name" VARCHAR(64) NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "unit_class" "EngineeringUnitClass" NOT NULL,
    "range_low" DOUBLE PRECISION,
    "range_high" DOUBLE PRECISION,
    "sensor_serial_number" VARCHAR(120),
    "alarm_limits" JSONB,

    CONSTRAINT "job_sensor_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarm_rules" (
    "id" TEXT NOT NULL,
    "job_id" TEXT,
    "well_id" TEXT,
    "canonical_tag_name" VARCHAR(64) NOT NULL,
    "condition" "AlarmCondition" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "severity" "AlarmSeverity" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alarm_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_events" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "kind" "OperationalEventKind" NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT,
    "actor_user_id" TEXT,
    "action" VARCHAR(120) NOT NULL,
    "entity_kind" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "ip_address" VARCHAR(64),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "wells_tenant_id_idx" ON "wells"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "wells_tenant_id_code_key" ON "wells"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_types_code_key" ON "equipment_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_units_code_key" ON "equipment_units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_units_serial_number_key" ON "equipment_units"("serial_number");

-- CreateIndex
CREATE INDEX "equipment_units_equipment_type_id_idx" ON "equipment_units"("equipment_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_tags_name_key" ON "canonical_tags"("name");

-- CreateIndex
CREATE INDEX "sensors_equipment_unit_id_idx" ON "sensors"("equipment_unit_id");

-- CreateIndex
CREATE INDEX "sensors_canonical_tag_name_idx" ON "sensors"("canonical_tag_name");

-- CreateIndex
CREATE UNIQUE INDEX "sensors_equipment_unit_id_instrument_tag_key" ON "sensors"("equipment_unit_id", "instrument_tag");

-- CreateIndex
CREATE UNIQUE INDEX "signalfire_devices_sensor_id_key" ON "signalfire_devices"("sensor_id");

-- CreateIndex
CREATE UNIQUE INDEX "signalfire_devices_device_id_key" ON "signalfire_devices"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_code_key" ON "jobs"("code");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_idx" ON "jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "jobs_well_id_idx" ON "jobs"("well_id");

-- CreateIndex
CREATE INDEX "jobs_equipment_unit_id_idx" ON "jobs"("equipment_unit_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "commissioning_snapshots_job_id_key" ON "commissioning_snapshots"("job_id");

-- CreateIndex
CREATE INDEX "job_sensor_snapshots_snapshot_id_idx" ON "job_sensor_snapshots"("snapshot_id");

-- CreateIndex
CREATE INDEX "job_sensor_snapshots_canonical_tag_name_idx" ON "job_sensor_snapshots"("canonical_tag_name");

-- CreateIndex
CREATE INDEX "alarm_rules_job_id_idx" ON "alarm_rules"("job_id");

-- CreateIndex
CREATE INDEX "alarm_rules_well_id_idx" ON "alarm_rules"("well_id");

-- CreateIndex
CREATE INDEX "alarm_rules_canonical_tag_name_idx" ON "alarm_rules"("canonical_tag_name");

-- CreateIndex
CREATE INDEX "operational_events_job_id_at_idx" ON "operational_events"("job_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_at_idx" ON "audit_logs"("tenant_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_kind_entity_id_idx" ON "audit_logs"("entity_kind", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wells" ADD CONSTRAINT "wells_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_units" ADD CONSTRAINT "equipment_units_equipment_type_id_fkey" FOREIGN KEY ("equipment_type_id") REFERENCES "equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_equipment_unit_id_fkey" FOREIGN KEY ("equipment_unit_id") REFERENCES "equipment_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signalfire_devices" ADD CONSTRAINT "signalfire_devices_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_well_id_fkey" FOREIGN KEY ("well_id") REFERENCES "wells"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_equipment_unit_id_fkey" FOREIGN KEY ("equipment_unit_id") REFERENCES "equipment_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissioning_snapshots" ADD CONSTRAINT "commissioning_snapshots_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_sensor_snapshots" ADD CONSTRAINT "job_sensor_snapshots_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "commissioning_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarm_rules" ADD CONSTRAINT "alarm_rules_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_events" ADD CONSTRAINT "operational_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
