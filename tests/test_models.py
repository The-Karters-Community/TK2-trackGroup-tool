from types import SimpleNamespace
import unittest
from unittest.mock import patch

from trackgroups.models import _geometry, _rig, _pack_textures, _material


class ModelTests(unittest.TestCase):
    def test_seated_preview_uses_driving_override_not_standing_menu_clip(self):
        driving = SimpleNamespace(peek_name=lambda:'Driving_idle')
        standing = SimpleNamespace(peek_name=lambda:'Idle_Menu')
        config = SimpleNamespace(read_typetree=lambda:{'CharacterA':{'Driving':[3], 'Menu':[4]}})
        component = SimpleNamespace(type=SimpleNamespace(name='MonoBehaviour'),
            read_typetree=lambda:{'charAnimationsListSO':2})
        prefab = SimpleNamespace(read_typetree=lambda:{'m_Component':[{'component':1}]})
        objects = {1:component,2:config,3:driving,4:standing}
        with patch('trackgroups.models._pointer', side_effect=lambda obj,p:objects.get(p)), patch('trackgroups.unity_animation.decode_clip', return_value={'name':'seated'}) as decode:
            root={'children':[{'path':'Character'}]}
            result=_rig(prefab,root)
        decode.assert_called_once_with(driving,root,'Character')
        self.assertEqual(result['animations'],[{'name':'seated'}])

    def test_shared_albedo_and_layers_are_encoded_once(self):
        material={'texture':'same-image','layers':{'_SecondaryTex':'same-image','_MaskTex':'mask-image'}}
        tree={'mesh':{'materials':[material]},'children':[]}
        textures=_pack_textures(tree)
        self.assertEqual(len(textures),2)
        self.assertEqual(material['texture'],material['layers']['_SecondaryTex'])
        self.assertEqual(textures[material['layers']['_MaskTex'][1:]],'mask-image')

    def test_custom_albedo_and_secondary_layer_are_not_replaced_by_legacy_slot(self):
        env=lambda id:{'m_Texture':{'m_PathID':id},'m_Scale':{'x':2,'y':3},'m_Offset':{'x':.25,'y':.5}}
        obj=SimpleNamespace(read_typetree=lambda:{'m_SavedProperties':{
            'm_TexEnvs':[('_MainTex',env(1)),('_AlbedoTex',env(2)),('_SecondaryTex',env(3))],
            'm_Colors':[('_Color',{'r':.2,'g':.3,'b':.4,'a':1})]}})
        with patch('trackgroups.models._pointer',side_effect=lambda obj,p:p['m_PathID'] if p else None), patch('trackgroups.models._texture_ref',side_effect=lambda obj:'texture-'+str(obj)):
            result=_material(SimpleNamespace(deref=lambda:obj))
        self.assertEqual(result['texture'],'texture-2')
        self.assertEqual(result['layers']['_SecondaryTex'],'texture-3')
        self.assertEqual(result['uvScale'],[2,3])
        self.assertEqual(result['uvOffset'],[.25,.5])

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
