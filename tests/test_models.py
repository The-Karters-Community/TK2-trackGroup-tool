from types import SimpleNamespace
import unittest
from unittest.mock import patch

from trackgroups.models import _geometry


class ModelTests(unittest.TestCase):
    def test_two_bone_influences_are_padded_per_vertex(self):
        handler = SimpleNamespace(
            process=lambda:None, m_Vertices=[(0,0,0), (1,0,0), (0,1,0)],
            m_Normals=[], m_UV0=[], get_triangles=lambda:[[(0,1,2)]],
            m_BoneIndices=[(0,1), (1,2), (2,0)],
            m_BoneWeights=[(.25,.75), (.5,.5), (1.,0.)])
        matrix = SimpleNamespace(**{f'e{row}{col}':float(row==col) for row in range(4) for col in range(4)})
        pointer = SimpleNamespace(read=lambda:SimpleNamespace(m_BindPose=[matrix]*3))
        with patch('UnityPy.helpers.MeshHelper.MeshHandler', return_value=handler):
            result = _geometry(pointer, [])
        self.assertEqual(result['skinIndices'], [0,1,0,0,1,2,0,0,2,0,0,0])
        self.assertEqual(result['skinWeights'], [.25,.75,0,0,.5,.5,0,0,1,0,0,0])
