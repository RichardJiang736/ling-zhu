import { EventEmitter } from 'events';

interface QueueTask<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  abortSignal?: AbortSignal;
  timestamp: number;
}

export class QueueManager extends EventEmitter {
  private static instance: QueueManager;
  private queue: QueueTask<any>[] = [];
  private activeCount: number = 0;
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly taskTimeout: number;

  private constructor(
    maxConcurrent: number = 2,
    maxQueueSize: number = 10,
    taskTimeout: number = 300000
  ) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.taskTimeout = taskTimeout;
    this.startCleanupInterval();
  }

  static getInstance(
    maxConcurrent: number = 2,
    maxQueueSize: number = 10,
    taskTimeout: number = 300000
  ): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager(maxConcurrent, maxQueueSize, taskTimeout);
    }
    return QueueManager.instance;
  }

  async enqueue<T>(
    taskId: string,
    task: () => Promise<T>,
    abortSignal?: AbortSignal
  ): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('Queue is full. Too many concurrent requests. Please try again later.');
    }

    if (abortSignal?.aborted) {
      throw new Error('Request was aborted before queuing');
    }

    return new Promise<T>((resolve, reject) => {
      const queueTask: QueueTask<T> = {
        id: taskId,
        execute: task,
        resolve,
        reject,
        abortSignal,
        timestamp: Date.now(),
      };

      if (abortSignal) {
        const abortHandler = () => {
          this.removeTask(taskId);
          reject(new Error('Request aborted by client'));
        };
        abortSignal.addEventListener('abort', abortHandler, { once: true });
      }

      this.queue.push(queueTask);
      this.emit('task-queued', { id: taskId, position: this.queue.length });
      this.processNext();
    });
  }

  private removeTask(taskId: string): void {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      const [task] = this.queue.splice(index, 1);
      this.emit('task-removed', { id: taskId });
    }
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    if (task.abortSignal?.aborted) {
      task.reject(new Error('Request aborted'));
      this.processNext();
      return;
    }

    this.activeCount++;
    this.emit('task-started', { 
      id: task.id, 
      activeCount: this.activeCount,
      queueLength: this.queue.length 
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), this.taskTimeout);
    });

    try {
      const result = await Promise.race([task.execute(), timeoutPromise]);
      task.resolve(result);
      this.emit('task-completed', { id: task.id });
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error('Task failed'));
      this.emit('task-failed', { id: task.id, error });
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      this.queue = this.queue.filter(task => {
        const isStale = now - task.timestamp > this.taskTimeout;
        if (isStale) {
          task.reject(new Error('Task expired in queue'));
          this.emit('task-expired', { id: task.id });
        }
        return !isStale;
      });
    }, 60000);
  }

  getStatus() {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
    };
  }
}
