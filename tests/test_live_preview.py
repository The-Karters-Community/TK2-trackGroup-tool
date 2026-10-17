import json
import threading
import unittest
import urllib.error
import urllib.request
from trackgroups.app import make_server


class RemovedCompanionTests(unittest.TestCase):
    def test_companion_endpoints_are_removed_and_cannot_touch_game_plugins(self):
        server = make_server(object())
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            for action in (
                "live-preview",
                "live-save-preset",
                "install-preview-companion",
                "remove-preview-companion",
            ):
                req = urllib.request.Request(
                    server.origin + "/api/" + action,
                    data=b"{}",
                    headers={
                        "X-TK2-Token": server.token,
                        "Content-Type": "application/json",
                    },
                )
                with self.subTest(action=action), self.assertRaises(
                    urllib.error.HTTPError
                ) as error:
                    urllib.request.urlopen(req)
                self.assertEqual(error.exception.code, 400)
                self.assertIn("Unknown action", json.load(error.exception)["error"])
                error.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
