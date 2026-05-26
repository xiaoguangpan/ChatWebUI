import { Camera } from 'lucide-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { apiGet, apiPatch, apiPostForm, assetUrl, type AuthUser } from '../api';
import { SubPageHeader } from '../components/SubPageHeader';

export const ProfileInfoPage: FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<{ user: AuthUser }>('/api/me')
      .then((res) => {
        setUser(res.user);
        setName(res.user.name);
      })
      .catch(() => undefined);
  }, []);

  const saveProfile = async () => {
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      const res = await apiPatch<{ user: AuthUser }>('/api/me', { name });
      setUser(res.user);
      setName(res.user.name);
      setSaved(true);
      window.dispatchEvent(new CustomEvent('chatwebui:auth-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存资料失败');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    setError('');
    setSaved(false);
    const form = new FormData();
    form.append('avatar', file);
    try {
      const res = await apiPostForm<{ user: AuthUser }>('/api/me/avatar', form);
      setUser(res.user);
      window.dispatchEvent(new CustomEvent('chatwebui:auth-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '头像上传失败');
    }
  };

  const avatarURL = assetUrl(user?.avatar_url);

  return (
    <>
      <SubPageHeader
        title="个人资料"
        back="/profile"
        right={
          <button type="button" className="c-btn c-btn--primary c-btn--sm" onClick={saveProfile} disabled={saving}>
            {saving ? '保存中' : '保存'}
          </button>
        }
      />

      <div className="page">
        <div className="page__inner">
          <div className="profile-avatar-block">
            <div className="profile-avatar-block__wrap">
              <span className="c-avatar c-avatar--xl">
                {avatarURL ? <img src={avatarURL} alt={user?.name ?? 'avatar'} /> : initials(user?.name ?? user?.phone ?? 'U')}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(event) => void uploadAvatar(event.target.files?.[0])}
              />
              <button type="button" className="profile-avatar-block__edit" aria-label="更换头像" onClick={() => fileInputRef.current?.click()}>
                <Camera size={14} />
              </button>
            </div>
            <div className="u-caption">头像会保存到本机上传目录。</div>
            {error && <div className="c-help" style={{ color: 'var(--danger)' }}>{error}</div>}
            {saved && <div className="c-help" style={{ color: 'var(--success)' }}>资料已保存</div>}
          </div>

          <div className="list-group">
            <div className="list-group__title">基础</div>
            <div className="list-item-form">
              <Field label="昵称" value={name} placeholder="昵称" onChange={setName} />
              <Field label="账号" value={user?.phone ?? ''} readOnly />
              <Field label="方案" value={user?.plan ?? ''} readOnly />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

type FieldProps = {
  label: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
};

const Field: FC<FieldProps> = ({ label, value, defaultValue, placeholder, readOnly, onChange }) => (
  <div className="c-field">
    <label className="c-label">{label}</label>
    <input
      className="c-input"
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(event) => onChange?.(event.target.value)}
    />
  </div>
);

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || 'U';
}
