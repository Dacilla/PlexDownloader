# **Design Proposal: Core Download and State Management System**

## **1\. Project Overview**

### **1.1. Concept**

This project proposes the development of a third-party mobile application named "PlexDownloader" (working title). The application's primary function is to provide a robust and user-friendly interface for browsing a user's Plex Media Server (PMS) libraries and downloading media for offline playback on mobile devices.

### **1.2. Motivation**

The official Plex mobile application, while feature-rich, exhibits several persistent issues related to its download functionality. Users frequently report that downloads are unstable, fail without clear error messages, become stuck in unrecoverable states, and that the application occasionally loses track of successfully downloaded files. This project aims to address these specific pain points by building a dedicated download client that prioritizes stability, transparency, and reliability.

### **1.3. Target Platforms**

The initial development will target the Android operating system. The primary test devices will be:

* **Phone:** Google Pixel 7a (representing a modern Android smartphone).  
* **Tablet:** Samsung Galaxy S7 Tablet (representing a modern Android tablet).

This focus ensures the application is optimized for the most common mobile and tablet form factors.

### **1.4. Project Management**

* **Source Control:** All source code and related documentation will be managed in a repository on GitHub.

## **2\. Technical Introduction**

This document outlines the core technical strategies for handling media downloads and state management. The objective is to create a system that is significantly more stable, transparent, and resilient than the current official Plex application. The following sections analyze specific failure points in the existing application, diagnose their probable technical causes, and detail the proposed implementation for the new system based on the official Plex Media Server API documentation.

## **3\. Analysis of Core Problems and Proposed Solutions**

### **3.1. Download Instability and Opaque Failures**

* **Problem Statement:** Downloads frequently fail without a clear reason. The process is often unstable, particularly when a specific quality is selected for the download.  
* **Probable Technical Cause:** The instability is rooted in the server-side **transcoding** process. When a user requests a version of a file that is not in its original quality, the Plex Media Server must re-encode the media in real-time. This is a CPU-intensive task that can fail due to server overload, media file incompatibilities, or complications from burning in subtitles. The official application abstracts these distinct server-side failure modes into a single, unhelpful "failed" state.  
* **Proposed Solution:** The application will mitigate transcoding failures by using the dedicated, asynchronous Download Queue API for transcoded files. For direct downloads, it will provide clear pre-flight checks and error reporting.  
* **Implementation Details:**  
  1. **Prioritize Direct Play:** For "Original Quality" requests, the application will use the get/library/parts/{partId}/{changestamp}/{filename} endpoint for a direct file transfer, which is the most stable method.  
  2. **Intelligent Fallback to Direct Stream:** If the original container is incompatible, the system will first attempt a Direct Stream by requesting a compatible container (e.g., MP4) via the transcode endpoint, which is less resource-intensive than a full transcode.  
  3. **Asynchronous Transcoding via Download Queue:** For all other quality requests, the application will use the /downloadQueue API. This is the primary method for transcoded downloads (see Section 3.4).  
  4. **Pre-flight Checks and Client Profile Augmentation:** Before initiating a transcode, the app will query server activity via GET /status/sessions. If the server is busy, the user will be warned. Additionally, the app can use the X-Plex-Client-Profile-Extra header to send add-limitation directives (e.g., limiting audio channels to 2\) to prevent the server from attempting transcodes that are known to be unstable or unsupported by the device.  
  5. **Specific Error Reporting:** The application will interpret different failure signals. For instance, an HTTP 503 (Service Unavailable) from the server implies server overload. The status from the Download Queue API will provide explicit progress. These will be translated into clear messages for the user.

### **3.2. Non-Resumable and "Stuck" Downloads**

* **Problem Statement:** A failed download often cannot be resumed. The only recourse is to delete the partial file and restart the download from the beginning.  
* **Probable Technical Cause:** \* For **transcoded streams**, the download URL is session-specific and ephemeral. If the session terminates, the URL is invalid.  
  * For **direct downloads**, the official app may not be correctly implementing HTTP Range Requests.  
* **Proposed Solution:** The application will implement robust resume logic for all downloads by leveraging native OS capabilities and specific Plex API features.  
* **Implementation Details:**  
  1. **Native Download Manager:** The application will delegate all file transfer tasks to the operating system's native download manager (URLSession on iOS, DownloadManager on Android), which natively supports resumable downloads via HTTP Range Requests.  
  2. **Resuming Direct and Queued Downloads:** Downloads from both get/library/parts/... and get/downloadQueue/.../media are standard file transfers and are inherently resumable by the native download manager.  
  3. **Resuming Failed Transcodes (Legacy Fallback):** If the Download Queue API is unavailable and a live transcode is necessary, the app will handle failures by making a new request to the /video/:/transcode/universal/start.\* endpoint, including the offset parameter (in seconds) to resume the transcode process from the point of failure.

### **3.3. "Forgotten" Downloads and Orphaned Files**

* **Problem Statement:** The official app sometimes "forgets" successfully downloaded files, leaving them inaccessible but still consuming storage.  
* **Probable Technical Cause:** This indicates a failure in metadata persistence. The application's internal manifest of downloaded files is likely fragile and can be cleared or corrupted.  
* **Proposed Solution:** The application will maintain a persistent and robust local database as the absolute source of truth for all downloaded content. The API documentation does not provide a server-side solution for this client-side problem, confirming this approach is correct.  
* **Implementation Details:**  
  1. **Local SQLite Database:** A local SQLite database will be used to store the download manifest.  
  2. **Schema Definition:** The database table for downloads will contain: media\_rating\_key, server\_identifier, local\_file\_path, a cached\_metadata\_json blob, download\_status, and created\_at\_timestamp.  
  3. **Source of Truth Logic:** The application's "Downloads" screen will be populated *exclusively* by querying this local database.  
  4. **Verification Routine:** A background routine will periodically verify that the file at local\_file\_path exists for each database entry, cleaning up any orphaned records.

### **3.4. Server-Managed Downloads via Download Queue API**

* **Problem Statement:** Managing a live transcode session is complex and prone to failure. A more robust, asynchronous method is needed.  
* **Official API Solution:** The /downloadQueue endpoints provide a purpose-built system for this exact scenario. This should be considered the **primary method** for all transcoded downloads.  
* **Implementation Details:**  
  1. **Get or Create Queue:** On first use, call POST /downloadQueue to establish a persistent queue for the client.  
  2. **Add Items with Quality Parameters:** To initiate a download, call POST /downloadQueue/{queueId}/add. This request will include the keys of the media to be downloaded along with all transcoding parameters (videoBitrate, videoResolution, audioBoost, etc.).  
  3. **Poll for Status:** The application will periodically call GET /downloadQueue/{queueId}/items to monitor the status of all items in the queue. The UI will reflect the status of each item (e.g., "Queued", "Preparing...", "Downloading", "Complete").  
  4. **Download Completed File:** Once an item's status in the queue is reported as available, the application will use the native download manager to fetch the final media file from GET /downloadQueue/{queueId}/item/{itemId}/media. This final transfer is a simple, resumable download.

## **4\. Key API Endpoint Reference**

This section provides a summary of the primary API endpoints required for the application's core functionality.

### **4.1. Authentication and Server Discovery**

* **POST https://plex.tv/api/v2/pins?strong=true**  
  * **Purpose:** Initiates the authentication process by generating a PIN for the user to authorize the application.  
* **GET https://plex.tv/api/v2/pins/{pinID}**  
  * **Purpose:** Polls the PIN status to retrieve the user's X-Plex-Token after they have authenticated.  
* **GET https://clients.plex.tv/api/v2/resources**  
  * **Purpose:** Fetches a list of all servers associated with the user's account, including their connection details and the server-specific accessToken required for all subsequent requests to that server.

### **4.2. Library Browsing and Metadata**

* **GET /library/sections**  
  * **Purpose:** Retrieves a list of all media libraries (e.g., "Movies," "TV Shows") on a specific server.  
* **GET /library/sections/{sectionId}/all**  
  * **Purpose:** Fetches all media items within a specific library section. Supports filtering and sorting.  
* **GET /library/metadata/{ratingKey}**  
  * **Purpose:** Retrieves detailed metadata for a single media item (e.g., a movie, show, or episode).  
* **GET /library/metadata/{ratingKey}/children**  
  * **Purpose:** Fetches the children of a parent item, such as getting all seasons for a show or all tracks for an album.

### **4.3. Downloading Media**

* **GET /library/parts/{partId}/{changestamp}/{filename}**  
  * **Purpose:** **(Direct Play)** Downloads the original, unmodified media file directly from the server. This is a standard, resumable file transfer.  
* **POST /downloadQueue**  
  * **Purpose:** **(Transcoded)** Gets or creates a persistent download queue on the server for the client. This is the first step for all transcoded downloads.  
* **POST /downloadQueue/{queueId}/add**  
  * **Purpose:** **(Transcoded)** Adds one or more media items to the download queue, specifying the desired transcoding parameters (videoBitrate, videoResolution, etc.).  
* **GET /downloadQueue/{queueId}/items**  
  * **Purpose:** **(Transcoded)** Polls the server to get the current status of all items in the queue (e.g., pending, transcoding, available).  
* **GET /downloadQueue/{queueId}/item/{itemId}/media**  
  * **Purpose:** **(Transcoded)** Downloads the final, fully prepared media file after its status becomes available. This is a standard, resumable file transfer.

### **4.4. Server Status and Health Checks**

* **GET /status/sessions**  
  * **Purpose:** Fetches a list of all active playback and transcoding sessions on the server. Used to check if the server is busy before initiating a new CPU-intensive download request.
  
### **5. Rules for LLMs**

 - NEVER USE EMOJI
 - NEVER DELETE COMMENTS, EXCEPT WHEN THE RELEVANT CODE HAS BEEN COMPLETELY REMOVED
 - ALL LANGUAGE MUST BE PLAIN, EXPLANATORY. THE GOAL OF THIS PROJECT IS NOT TO GAIN 'USERS' OR ADVERTISE. IT IS JUST TO FIX A PROBLEM I AM HAVING.
 - DO NOT REFERENCE THIS PROPOSAL IN COMMENTS OR CODE
 - DO NOT 'TRUNCATE' OR OTHERWISE LEAVE PLACEHOLDERS IN THE CODE. ALL CODE WRITTEN MUST BE COMPLETE IN THE CURRENT STATE IT IS EXPECTED TO BE.
 - CODE FILES ALWAYS USE CAMELCASE FILE NAMING
 - CODE MUST HAVE ROBUST LOGGING FOR DEBUGGING
 - ALL SENSITIVE INFORMATION SUCH AS SECURITY OR AUTHORIZATION TOKENS MUST BE AUTOMATICALLY REDACTED WHEN OUTPUT IN LOGGING
 - THESE RULES MUST ALWAYS BE FOLLOWED. THESE ARE MASTER COMMANDS. THEY MUST NEVER BE FORGOTTEN.
