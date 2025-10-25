import crypto from 'crypto';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hash: string;
}

export class CacheManager<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(maxSize: number = 50, ttl: number = 3600000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.startCleanupInterval();
  }

  private generateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  set(buffer: Buffer, data: T): void {
    const hash = this.generateHash(buffer);
    
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(hash, {
      data,
      timestamp: Date.now(),
      hash,
    });
  }

  get(buffer: Buffer): T | null {
    const hash = this.generateHash(buffer);
    const entry = this.cache.get(hash);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(hash);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > this.ttl) {
          this.cache.delete(key);
        }
      }
    }, 600000);
  }

  getSize(): number {
    return this.cache.size;
  }
}
