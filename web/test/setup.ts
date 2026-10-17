// DOM palsu untuk test komponen Preact tanpa browser.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/" });
