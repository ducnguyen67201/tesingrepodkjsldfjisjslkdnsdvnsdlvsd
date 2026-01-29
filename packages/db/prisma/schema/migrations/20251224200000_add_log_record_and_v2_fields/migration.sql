-- CreateTable: LogRecord
CREATE TABLE "public"."LogRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "serviceName" TEXT,
    "serviceVersion" TEXT,
    "environment" TEXT,
    "resource" JSONB,
    "scopeName" TEXT,
    "scopeVersion" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "observedTime" TIMESTAMP(3),
    "severityNumber" INTEGER,
    "severityText" TEXT,
    "body" JSONB,
    "bodyText" TEXT,
    "attributes" JSONB,
    "droppedAttributesCount" INTEGER,
    "traceId" TEXT,
    "spanId" TEXT,
    "flags" INTEGER,
    "ingestSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: LogRecord indexes
CREATE INDEX "LogRecord_projectId_serviceName_idx" ON "public"."LogRecord"("projectId" ASC, "serviceName" ASC);
CREATE INDEX "LogRecord_projectId_severityNumber_idx" ON "public"."LogRecord"("projectId" ASC, "severityNumber" ASC);
CREATE INDEX "LogRecord_projectId_timestamp_idx" ON "public"."LogRecord"("projectId" ASC, "timestamp" DESC);
CREATE INDEX "LogRecord_projectId_traceId_idx" ON "public"."LogRecord"("projectId" ASC, "traceId" ASC);
CREATE INDEX "LogRecord_timestamp_idx" ON "public"."LogRecord"("timestamp" ASC);

-- AddForeignKey: LogRecord -> Project
ALTER TABLE "public"."LogRecord" ADD CONSTRAINT "LogRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Span - Add v2 fields
ALTER TABLE "public"."Span" ADD COLUMN "dbCollection" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "dbName" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "dbOperation" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "dbStatement" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "dbSystem" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "exceptionMessage" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "exceptionType" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "genAiOperation" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "genAiProvider" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "httpMethod" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "httpRoute" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "httpStatusCode" INTEGER;
ALTER TABLE "public"."Span" ADD COLUMN "httpUrl" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "rpcMethod" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "rpcService" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "rpcStatusCode" INTEGER;
ALTER TABLE "public"."Span" ADD COLUMN "rpcSystem" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "searchText" TEXT;
ALTER TABLE "public"."Span" ADD COLUMN "spanType" TEXT;

-- CreateIndex: Span v2 indexes
CREATE INDEX "Span_dbSystem_idx" ON "public"."Span"("dbSystem" ASC);
CREATE INDEX "Span_exceptionType_idx" ON "public"."Span"("exceptionType" ASC);
CREATE INDEX "Span_genAiOperation_idx" ON "public"."Span"("genAiOperation" ASC);
CREATE INDEX "Span_genAiProvider_idx" ON "public"."Span"("genAiProvider" ASC);
CREATE INDEX "Span_httpRoute_idx" ON "public"."Span"("httpRoute" ASC);
CREATE INDEX "Span_httpStatusCode_idx" ON "public"."Span"("httpStatusCode" ASC);
CREATE INDEX "Span_rpcSystem_idx" ON "public"."Span"("rpcSystem" ASC);
CREATE INDEX "Span_traceId_spanType_idx" ON "public"."Span"("traceId" ASC, "spanType" ASC);

-- AlterTable: Trace - Add v2 fields
ALTER TABLE "public"."Trace" ADD COLUMN "hasError" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."Trace" ADD COLUMN "hasException" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."Trace" ADD COLUMN "rootSpanDurationMs" INTEGER;
ALTER TABLE "public"."Trace" ADD COLUMN "rootSpanId" TEXT;
ALTER TABLE "public"."Trace" ADD COLUMN "rootSpanKind" TEXT;
ALTER TABLE "public"."Trace" ADD COLUMN "rootSpanName" TEXT;
ALTER TABLE "public"."Trace" ADD COLUMN "rootSpanStatusCode" TEXT;
ALTER TABLE "public"."Trace" ADD COLUMN "searchText" TEXT;
ALTER TABLE "public"."Trace" ADD COLUMN "spanTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex: Trace v2 indexes
CREATE INDEX "Trace_projectId_hasError_idx" ON "public"."Trace"("projectId" ASC, "hasError" ASC);
CREATE INDEX "Trace_projectId_hasException_idx" ON "public"."Trace"("projectId" ASC, "hasException" ASC);
CREATE INDEX "Trace_projectId_rootSpanName_idx" ON "public"."Trace"("projectId" ASC, "rootSpanName" ASC);
CREATE INDEX "Trace_projectId_rootSpanStatusCode_idx" ON "public"."Trace"("projectId" ASC, "rootSpanStatusCode" ASC);
