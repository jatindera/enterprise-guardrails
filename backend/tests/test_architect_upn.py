import unittest
from app.modules.projects.architect_upn import AmbiguousArchitect, architect_upn_from_intake


class ArchitectUPNTests(unittest.TestCase):
    def test_formats(self):
        for value in ("Name <USER@example.com>", "[Name](mailto:USER@example.com)", "USER@example.com"):
            with self.subTest(value=value):
                result = architect_upn_from_intake(f"- **Architect Assigned:** {value}")
                self.assertEqual(result.upn, "user@example.com")
                self.assertTrue(result.present)

    def test_table_absent_and_empty(self):
        self.assertEqual(architect_upn_from_intake("| Architect Assigned | [Person](mailto:p@example.com) | ").upn, "p@example.com")
        self.assertFalse(architect_upn_from_intake("Other: p@example.com").present)
        self.assertIsNone(architect_upn_from_intake("Architect Assigned: Not assigned").upn)
        self.assertEqual(architect_upn_from_intake(r"- \*\*Architect Assigned:\*\* user@example.com").upn, "user@example.com")

    def test_ambiguous_never_selects_one(self):
        with self.assertRaises(AmbiguousArchitect):
            architect_upn_from_intake("Architect Assigned: a@example.com, b@example.com")
        with self.assertRaises(AmbiguousArchitect):
            architect_upn_from_intake("Architect Assigned: a@example.com\nArchitect Assigned: b@example.com")


if __name__ == "__main__":
    unittest.main()
