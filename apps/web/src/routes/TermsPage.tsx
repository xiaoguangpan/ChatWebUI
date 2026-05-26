import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { SubPageHeader } from '../components/SubPageHeader';

/**
 * /terms 服务条款。
 * 参考 ChatGPT / Anthropic 的法律页结构,使用 .legal 容器与可读宽度限制。
 */
export const TermsPage: FC = () => (
  <>
    <SubPageHeader title="服务条款" back="/profile" />

    <div className="page">
      <div className="page__inner legal">
        <p className="legal__updated">最近更新于 2026 年 5 月 1 日</p>
        <h1 className="legal__h1">ChatWebUI 服务条款</h1>
        <p className="legal__lead">
          欢迎使用 ChatWebUI(下称"我们"或"服务")。以下条款规定了你与我们之间关于服务使用的权利与义务。请你在使用服务前仔细阅读。
        </p>

        <h2 className="legal__h2">1. 接受条款</h2>
        <p>
          注册或使用本服务即表示你同意本条款全部内容。如果你不同意,请勿使用本服务。
        </p>

        <h2 className="legal__h2">2. 账户与责任</h2>
        <ul>
          <li>你必须年满 13 岁。如果你不满 18 岁,需获得法定监护人同意。</li>
          <li>请妥善保管账号与密码,因账号泄露造成的损失由你自行承担。</li>
          <li>你应对通过你账号产生的所有行为与内容负责。</li>
        </ul>

        <h2 className="legal__h2">3. 允许与禁止的使用</h2>
        <p>你 <strong>不得</strong> 利用本服务从事以下行为:</p>
        <ul>
          <li>违反所在地法律、侵犯他人合法权益。</li>
          <li>生成、传播虚假信息、仇恨言论、暴力或色情内容。</li>
          <li>用于自动化攻击、爬取、绕过我们的限流与计费机制。</li>
          <li>逆向工程、反编译、试图获取模型权重或后端源码。</li>
        </ul>

        <h2 className="legal__h2">4. 内容与所有权</h2>
        <p>
          你输入的提示词与上传内容(以下称"输入"),其权利归你所有。AI 生成的输出
          (以下称"输出")在法律允许的范围内,我们将其权利分配给你,但不对其原创性、合法性、商业可用性作出保证。
        </p>
        <p>
          模型本身、平台代码、品牌商标等知识产权,归 ChatWebUI 或其授权方所有。
        </p>

        <h2 className="legal__h2">5. 积分与计费</h2>
        <ul>
          <li>积分为虚拟道具,不可提现、不可转让。</li>
          <li>充值后未消耗的积分,可在 12 个月内继续使用。</li>
          <li>因模型上游故障导致的失败请求,我们将自动退还相应积分。</li>
        </ul>

        <h2 className="legal__h2">6. 服务可用性</h2>
        <p>
          我们将尽合理努力保持服务的连续可用,但 <strong>不</strong> 承诺 100% 的可用性。
          因不可抗力、上游故障、计划维护等原因导致的中断不视为违约。
        </p>

        <h2 className="legal__h2">7. 隐私</h2>
        <p>
          我们如何收集、使用、保护你的个人信息,详见 <Link to="/terms#privacy">《隐私政策》</Link>。
          简言之: 我们 <strong>不会</strong> 把你的对话用于训练模型;
          仅在排障与计费需要时短期保留必要日志。
        </p>

        <h2 className="legal__h2">8. 终止</h2>
        <p>
          你可以随时在"安全"页面注销账号。我们也保留在你严重违反本条款时,
          暂停或终止服务的权利。
        </p>

        <h2 className="legal__h2">9. 免责声明</h2>
        <p>
          AI 输出可能不准确、不完整或带有偏见,你应自行核实并对依赖输出做出的决定负责。
          在法律允许的范围内,我们不对间接、附带、惩罚性损失承担责任。
        </p>

        <h2 className="legal__h2">10. 条款变更</h2>
        <p>
          我们可能不定期更新本条款,重大变更会以邮件或站内通知方式提前告知。
          继续使用服务视为接受变更后的条款。
        </p>

        <h2 className="legal__h2">11. 联系我们</h2>
        <p>
          如对本条款有任何疑问,请通过邮箱 <a href="mailto:legal@chatwebui.app">legal@chatwebui.app</a> 与我们联系。
        </p>

        <hr className="legal__divider" />
        <p className="u-caption">
          ©2026 ChatWebUI. All rights reserved.
        </p>
      </div>
    </div>
  </>
);
