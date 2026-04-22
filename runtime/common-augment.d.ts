declare module '@sero-ai/common' {
  export type AppRuntimeNotificationType = 'info' | 'warning' | 'error';

  export interface AppRuntimeNotificationOptions {
    message: string;
    type?: AppRuntimeNotificationType;
    source?: string;
    sound?: string | boolean;
    subtitle?: string;
  }

  export interface AppRuntimeNotificationsApi {
    notify(options: AppRuntimeNotificationOptions): void;
  }

  export interface AppRuntimeHost {
    notifications: AppRuntimeNotificationsApi;
  }
}

export {};
