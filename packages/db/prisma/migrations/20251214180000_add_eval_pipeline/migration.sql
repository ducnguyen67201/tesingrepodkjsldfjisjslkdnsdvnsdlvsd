-- CreateEnum
CREATE TYPE "EvalRunStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'REGRESSION_DETECTED');

-- CreateTable
CREATE TABLE "eval_suites" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "endpoint" TEXT NOT NULL,
    "prompts" JSONB NOT NULL,
    "expectedBehaviors" JSONB NOT NULL,
    "baselineLatencyP95" DOUBLE PRECISION,
    "baselineErrorRate" DOUBLE PRECISION,
    "baselineScores" JSONB,
    "latencyRegressionThreshold" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    "errorRegressionThreshold" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eval_suites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_runs" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "triggerRef" TEXT,
    "status" "EvalRunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalPrompts" INTEGER NOT NULL,
    "passedPrompts" INTEGER,
    "failedPrompts" INTEGER,
    "latencyP95" DOUBLE PRECISION,
    "errorRate" DOUBLE PRECISION,
    "scores" JSONB,
    "isRegression" BOOLEAN,
    "regressionDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eval_suites_projectId_idx" ON "eval_suites"("projectId");

-- CreateIndex
CREATE INDEX "eval_runs_suiteId_createdAt_idx" ON "eval_runs"("suiteId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "eval_suites" ADD CONSTRAINT "eval_suites_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "eval_suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
