import struct
import unittest
import zlib

from trackgroups.unity_animation import decode_clip, streamed_channels


class Clip:
    def __init__(self, tree): self.tree = tree
    def read_typetree(self): return self.tree


class AnimationTests(unittest.TestCase):
    def test_streamed_polynomial_and_constant_channels_reach_exact_bone(self):
        raw = struct.pack('<fi', 0., 1) + struct.pack('<i4f', 0, 0., 0., 2., 1.)
        data = list(struct.unpack('<' + 'I' * (len(raw)//4), raw))
        clip = Clip({'m_Name':'idle', 'm_MuscleClip':{'m_StartTime':0.,'m_StopTime':1.,'m_Clip':{'data':{
            'm_StreamedClip':{'data':data,'curveCount':1},
            'm_DenseClip':{'m_CurveCount':0,'m_FrameCount':0,'m_BeginTime':0.,'m_SampleRate':30.,'m_SampleArray':[]},
            'm_ConstantClip':{'data':[4.,5.]},
        }}},'m_ClipBindingConstant':{'genericBindings':[{'typeID':4,'attribute':1,'path':zlib.crc32(b'Bone')}]}})
        root = {'id':'root','path':'Character','children':[{'id':'bone','path':'Character/Bone','children':[]}]}
        result = decode_clip(clip, root, 'Character')
        track = result['tracks'][0]
        self.assertEqual(track['node'],'bone')
        self.assertEqual(track['values'][:3],[1.,4.,5.])
        self.assertEqual(track['values'][-3:],[3.,4.,5.])

    def test_invalid_streamed_channel_fails_without_reading_beyond_payload(self):
        raw = struct.pack('<fi',0.,2)
        data = list(struct.unpack('<2I',raw))
        with self.assertRaises(ValueError): streamed_channels(data, 1)
