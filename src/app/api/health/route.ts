import { NextResponse } from "next/server";
import { QueueManager } from "@/lib/queue-manager";

export const dynamic = 'force-dynamic';

export async function GET() {
  const queueManager = QueueManager.getInstance();
  const queueStatus = queueManager.getStatus();

  return NextResponse.json({ 
    status: "ok",
    timestamp: Date.now(),
    uptime: process.uptime(),
    queue: {
      active: queueStatus.activeCount,
      pending: queueStatus.queueLength,
      capacity: queueStatus.maxConcurrent,
      maxQueue: queueStatus.maxQueueSize,
      available: queueStatus.maxConcurrent - queueStatus.activeCount > 0,
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    }
  });
}