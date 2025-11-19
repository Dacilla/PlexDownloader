/**
 * Network Monitor
 * Monitors network connectivity and provides callbacks for state changes.
 */
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';

type NetworkCallback = (isConnected: boolean) => void;

class NetworkMonitor {
  private isConnected: boolean = true;
  private listeners: Set<NetworkCallback> = new Set();
  private unsubscribe: NetInfoSubscription | null = null;

  initialize(): void {
    if (this.unsubscribe) {
      console.warn('[NetworkMonitor] Already initialized');
      return;
    }

    console.log('[NetworkMonitor] Initializing network monitoring');
    
    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const wasConnected = this.isConnected;
      this.isConnected = state.isConnected ?? false;
      
      if (wasConnected !== this.isConnected) {
        console.log(`[NetworkMonitor] Network state changed: ${this.isConnected ? 'connected' : 'disconnected'}`);
        this.notifyListeners();
      }
    });

    NetInfo.fetch().then((state: NetInfoState) => {
      this.isConnected = state.isConnected ?? false;
      console.log(`[NetworkMonitor] Initial network state: ${this.isConnected ? 'connected' : 'disconnected'}`);
    });
  }

  cleanup(): void {
    if (this.unsubscribe) {
      console.log('[NetworkMonitor] Cleaning up network monitoring');
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.listeners.clear();
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  addListener(callback: NetworkCallback): void {
    this.listeners.add(callback);
  }

  removeListener(callback: NetworkCallback): void {
    this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => {
      try {
        callback(this.isConnected);
      } catch (error) {
        console.error('[NetworkMonitor] Error in listener callback:', error);
      }
    });
  }

  async checkConnection(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.isConnected ?? false;
    } catch (error) {
      console.error('[NetworkMonitor] Failed to check connection:', error);
      return false;
    }
  }
}

export const networkMonitor = new NetworkMonitor();
export default networkMonitor;