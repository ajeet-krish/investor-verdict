# Agents package note

Live voice uses dynamic import of `@elevenlabs/client` so mock bundles never load it.

There is no root package.json in this repo yet, so the frontend app owns this dependency. Before using live mode, install the pinned client from the frontend folder:

`npm i @elevenlabs/client@0.3.1`

Notes:
* Keep this pinned version in sync with `agents/README.md`
* Mock mode needs no install and no key
* Live mode uses public agent IDs in the browser, no key in client code
* Signed URL support is optional for private agents
