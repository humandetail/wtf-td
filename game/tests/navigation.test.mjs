import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('battlefield home control never navigates or reloads the page',()=>{const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/<a[^>]*class="wordmark"[^>]*href=/);assert.match(html,/<button[^>]*id="home-button"/);});
