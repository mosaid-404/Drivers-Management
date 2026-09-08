import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// In browser environments (and iframes), initializeFirestore with experimentalForceLongPolling: true
// prevents WebChannel streaming connection drops and [code=unavailable] errors
if (typeof window !== 'undefined') {
  try {
    initializeFirestore(app, {
      experimentalForceLongPolling: true,
    }, firebaseConfig.firestoreDatabaseId);
  } catch {
    // If already initialized, ignore
  }
}

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    } else if ((error as { code?: string })?.code === 'unavailable') {
      console.warn("Firestore backend is operating in offline mode until connection is established.");
    }
  }
}
testConnection().catch(() => {});
