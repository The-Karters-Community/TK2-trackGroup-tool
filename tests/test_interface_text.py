from pathlib import Path
import re
import unittest

class InterfaceTextTests(unittest.TestCase):
    def test_interface_sources_have_valid_utf8_without_broken_encoding_sequences(self):
        root=Path(__file__).resolve().parents[1]
        bad=re.compile(r'\u00e2(?:\u20ac|[\u0080-\u009f])|\u00c2[\u0080-\u00bf]|\u00c3[\u0080-\u00bf]|\ufffd')
        files=list((root/'ui/src').rglob('*'))+list((root/'trackgroups').glob('*.py'))
        for file in files:
            if file.suffix not in ('.jsx','.js','.css','.py'):continue
            with self.subTest(file=str(file.relative_to(root))):
                self.assertIsNone(bad.search(file.read_text(encoding='utf-8')))
