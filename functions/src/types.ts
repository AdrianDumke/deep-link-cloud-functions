import { Timestamp } from 'firebase-admin/firestore';

export default interface DeepLinkConfig {
  path?: string;
  'og:title'?: string;
  'og:description'?: string;
  'og:image'?: string;
  redirectToStore?: boolean;
  redirectUrl?: string;
  expires?: Timestamp;
}
