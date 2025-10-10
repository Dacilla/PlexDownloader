/**
 * Plex API Client
 * Implements authentication and core API endpoints from Section 4.
 * REFACTORED to be a stateful client for robust, reliable server communication.
 */

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import {
  PlexPin,
  PlexServer,
  PlexConnection,
  PlexApiResponse,
  PlexLibrariesResponse,
  PlexMediaResponse,
} from '../types/plex';

const PLEX_TV_URL = 'https://plex.tv';
const PLEX_CLIENT_IDENTIFIER = 'com.plexdownloader.mobile';
const PLEX_PRODUCT_NAME = 'PlexDownloader';
const PLEX_VERSION = '1.0.0';

/**
 * Censors the Plex token from a URL string for safe logging.
 */
function censorToken(url: string | undefined): string {
  if (!url) return 'URL undefined';
  return url.replace(/X-Plex-Token=([^&]+)/g, 'X-Plex-Token=REDACTED');
}

/**
 * Helper function to determine if an IP address is in a private/local range.
 */
function isLocalIp(address: string): boolean {
  return (
    /^(192\.168\.)/.test(address) ||
    /^(10\.)/.test(address) ||
    /^(172\.1[6-9]\.|172\.2[0-9]\.|172\.3[0-1]\.)/.test(address) ||
    /^(127\.)/.test(address) ||
    address === 'localhost'
  );
}

class PlexClient {
  private axiosInstance: AxiosInstance;
  private userToken: string | null = null;
  
  private activeServer: PlexServer | null = null;
  private activeServerUrl: string | null = null;
  private activeServerToken: string | null = null;
  private activeServerDownloadUrl: string | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 15000,
    });

    this.axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      config.headers['Accept'] = 'application/json';
      config.headers['X-Plex-Client-Identifier'] = PLEX_CLIENT_IDENTIFIER;
      config.headers['X-Plex-Product'] = PLEX_PRODUCT_NAME;
      config.headers['X-Plex-Version'] = PLEX_VERSION;
      config.headers['X-Plex-Platform'] = 'Android';
      config.headers['X-Plex-Device'] = 'Mobile';

      if (this.activeServerUrl && this.activeServerToken && config.url?.startsWith(this.activeServerUrl)) {
        config.headers['X-Plex-Token'] = this.activeServerToken;
      } else if (config.url?.includes('plex.tv') && this.userToken) {
        config.headers['X-Plex-Token'] = this.userToken;
      }
      
      console.log(`Request: ${config.method?.toUpperCase()} ${censorToken(config.url)}`);
      if (config.params) {
        console.log('With Params:', JSON.stringify(config.params));
      }

      return config;
    });

    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log(`Response: ${response.status} from ${censorToken(response.config.url)}`);
        return response;
      },
      (error) => {
        const url = censorToken(error.config?.url);
        if (error.code === 'ECONNABORTED') {
          console.error('Request timeout:', url);
        } else if (error.response) {
          console.error(`Server error ${error.response.status}:`, url);
        } else if (error.request) {
          console.error('No response received:', url);
        } else {
          console.error('Request setup error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  setUserToken(token: string): void {
    this.userToken = token;
  }

  getUserToken(): string | null {
    return this.userToken;
  }
  
  getActiveServerToken(): string | null {
    return this.activeServerToken;
  }

  setActiveServer(server: PlexServer): void {
    this.activeServer = server;
    this.activeServerUrl = this.getBestConnectionUri(server.connections, false);
    this.activeServerDownloadUrl = this.getBestConnectionUri(server.connections, true);
    this.activeServerToken = server.accessToken;
  }

  clearActiveServer(): void {
    this.activeServer = null;
    this.activeServerUrl = null;
    this.activeServerDownloadUrl = null;
    this.activeServerToken = null;
  }

  getActiveServerUrl(): string | null {
    return this.activeServerUrl;
  }

  private getBestConnectionUri(connections: PlexConnection[], forDownload: boolean): string {
    const idealConnection = connections.find(c => 
      c.protocol === 'https' && 
      !isLocalIp(c.address) && 
      !c.uri.includes('plex.direct')
    );
    if (idealConnection) {
      return idealConnection.uri;
    }
  
    if (forDownload) {
        const anyPublic = connections.find(c => !isLocalIp(c.address) && !c.uri.includes('plex.direct'));
        if (anyPublic) return anyPublic.uri;
    } else {
      const secureRemote = connections.find(c => c.protocol === 'https' && !isLocalIp(c.address));
      if (secureRemote) return secureRemote.uri;
    }
  
    const anyRemote = connections.find(c => !isLocalIp(c.address));
    if (anyRemote) return anyRemote.uri;

    return connections[0]?.uri || '';
  }
  
  // **NEW**: Function to get a transcoded image URL for performance.
  getTranscodedImageUrl(path: string, width: number, height: number): string | undefined {
    if (!this.activeServerUrl || !this.activeServerToken) {
        return undefined;
    }
    const encodedUrl = encodeURIComponent(path);
    return `${this.activeServerUrl}/photo/:/transcode?url=${encodedUrl}&width=${width}&height=${height}&minSize=1&X-Plex-Token=${this.activeServerToken}`;
  }

  async createAuthPin(): Promise<PlexPin> {
    const response = await this.axiosInstance.post<{ id: number; code: string }>(
      `${PLEX_TV_URL}/api/v2/pins`
    );
    return { id: response.data.id, code: response.data.code, authToken: null };
  }

  async checkPinStatus(pinId: number): Promise<string | null> {
    const response = await this.axiosInstance.get<{ authToken: string | null }>(
      `${PLEX_TV_URL}/api/v2/pins/${pinId}`
    );
    return response.data.authToken;
  }

  async getServers(): Promise<PlexServer[]> {
    const response = await this.axiosInstance.get(
      `https://clients.plex.tv/api/v2/resources`,
      { params: { includeHttps: 1 } }
    );
    const servers = response.data.filter((r: any) => r.provides === 'server');
    return servers.map((s: any) => ({
      name: s.name,
      host: s.connections[0]?.address || '',
      port: s.connections[0]?.port || 32400,
      machineIdentifier: s.clientIdentifier,
      accessToken: s.accessToken,
      scheme: s.connections[0]?.protocol || 'http',
      owned: s.owned === 1,
      connections: s.connections.map((c: any) => ({
        protocol: c.protocol,
        address: c.address,
        port: c.port,
        uri: c.uri,
        local: isLocalIp(c.address),
      })),
    }));
  }

  async getLibrarySections(): Promise<PlexApiResponse<PlexLibrariesResponse>> {
    if (!this.activeServerUrl) throw new Error("No active server configured.");
    const response = await this.axiosInstance.get(`${this.activeServerUrl}/library/sections`);
    return response.data;
  }

  async getLibrarySectionItems(params: {
    sectionId: string;
    offset: number;
    limit: number;
    sort?: string;
    title?: string;
    unwatched?: boolean;
  }): Promise<PlexApiResponse<PlexMediaResponse>> {
    const { sectionId, offset, limit, sort, title, unwatched } = params;

    if (!this.activeServerUrl) throw new Error("No active server configured.");

    const queryParams: any = {
      'X-Plex-Container-Start': offset,
      'X-Plex-Container-Size': limit,
    };

    if (sort) queryParams.sort = sort;
    if (title) queryParams.title = title;
    if (unwatched) queryParams.unwatched = 1;

    const response = await this.axiosInstance.get(`${this.activeServerUrl}/library/sections/${sectionId}/all`, {
      params: queryParams,
    });
    return response.data;
  }

  async getMediaMetadata(ratingKey: string): Promise<PlexApiResponse<PlexMediaResponse>> {
    if (!this.activeServerUrl) throw new Error("No active server configured.");
    const response = await this.axiosInstance.get(`${this.activeServerUrl}/library/metadata/${ratingKey}`);
    return response.data;
  }
  
  getDirectDownloadUrl(partId: number, changestamp: string, filename: string): string {
    if (!this.activeServer || !this.activeServerToken) {
      throw new Error("No active server configured for download.");
    }
  
    const downloadConnection = this.activeServer.connections.find(c => 
      !isLocalIp(c.address) && !c.uri.includes('plex.direct')
    );
  
    const baseUrl = downloadConnection?.uri || this.activeServerUrl;
  
    if (!baseUrl) {
      throw new Error("Could not determine a valid download URL.");
    }
  
    return `${baseUrl}/library/parts/${partId}/${changestamp}/${encodeURIComponent(filename)}?X-Plex-Token=${this.activeServerToken}`;
  }
}

export const plexClient = new PlexClient();
export default plexClient;

